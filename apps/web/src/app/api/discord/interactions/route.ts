import { NextResponse } from "next/server";
import { nameKey, validateIncident } from "@goopkos/core";
import { db } from "@/lib/db";
import { insertIncident } from "@/lib/ingest";
import { className } from "@/lib/classes";
import {
  EPHEMERAL, InteractionType, ResponseType, reporterName, subcommand, verifyDiscord,
  type Interaction,
} from "@/lib/discord";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://goop-kos.vercel.app";

/** Escape Discord markdown in anything a user typed before echoing it. */
function md(s: string): string {
  return s.replace(/([\\*_`~|>#\[\]()-])/g, "\\$1");
}

/** A channel message. allowed_mentions is empty so typed text can never ping. */
function reply(content: string, ephemeral = false): NextResponse {
  return NextResponse.json({
    type: ResponseType.MESSAGE,
    data: { content, allowed_mentions: { parse: [] }, ...(ephemeral ? { flags: EPHEMERAL } : {}) },
  });
}

interface Summary {
  name: string;
  class: string | null;
  level: number | null;
  kills: number;
  reports: number;
  last_zone: string | null;
  last_note: string | null;
  last_reported_by: string | null;
}

async function summary(name: string): Promise<Summary | null> {
  const res = await db().query<Summary>(
    `select t.name, t.class, t.level,
            count(i.id) filter (where i.kind = 'killed_me')::int as kills,
            count(i.id)::int as reports,
            (array_agg(i.zone order by i.occurred_at desc) filter (where i.zone is not null))[1] as last_zone,
            (array_agg(i.note order by i.occurred_at desc) filter (where i.note is not null))[1] as last_note,
            (array_agg(i.reported_by order by i.occurred_at desc))[1] as last_reported_by
       from kos_target t
       left join kos_incident i on i.target_id = t.id
      where t.name_key = $1
      group by t.id`,
    [nameKey(name)],
  );
  return res.rows[0] ?? null;
}

function describe(s: Summary): string {
  const who = [className(s.class), s.level ? `level ${s.level}` : null].filter((x) => x && x !== "Unknown").join(", ");
  const lines = [
    `**${md(s.name)}**${who ? ` (${who})` : ""}: **${s.kills}** kill${s.kills === 1 ? "" : "s"} on us, ${s.reports} report${s.reports === 1 ? "" : "s"}`,
  ];
  if (s.last_zone) lines.push(`Last seen in ${md(s.last_zone)}`);
  if (s.last_note) lines.push(`> ${md(s.last_note)}`);
  return lines.join("\n");
}

async function add(i: Interaction): Promise<NextResponse> {
  const { opts } = subcommand(i);
  const reporter = reporterName(i);

  // Typed "narshok gristlebalm" for someone already listed? Keep the list's
  // capitalisation rather than overwrite it.
  const existing = opts.name
    ? (await db().query<{ name: string }>("select name from kos_target where name_key = $1", [nameKey(opts.name)])).rows[0]
    : undefined;

  const incident = validateIncident({
    // The interaction id is unique per command use, so a Discord retry of
    // the same interaction lands once, like every other clientId.
    clientId: `discord-${i.id}`,
    name: existing?.name ?? opts.name,
    kind: opts.what || "killed_me",
    class: opts.class || undefined,
    zone: opts.where,
    note: opts.why,
    occurredAt: Math.floor(Date.now() / 1000),
    reportedBy: reporter,
  });
  if ("error" in incident) return reply(`Couldn't add that: ${incident.error}`, true);

  const client = await db().connect();
  try {
    await client.query("begin");
    await insertIncident(client, incident, "discord");
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    console.error("[discord add]", err);
    return reply("Something went wrong saving that. Try again in a moment.", true);
  } finally {
    client.release();
  }

  const s = await summary(incident.name);
  const verb = incident.kind === "killed_me" ? "killed one of us" : "ganked us";
  return reply(
    `🎯 **${md(incident.name)}** ${verb}. Added to KOS by **${md(reporter)}**.` +
      (s ? `\nNow **${s.kills}** kill${s.kills === 1 ? "" : "s"} on us across ${s.reports} report${s.reports === 1 ? "" : "s"}.` : "") +
      (incident.note ? `\n> ${md(incident.note)}` : ""),
  );
}

async function check(i: Interaction): Promise<NextResponse> {
  const { opts } = subcommand(i);
  const s = opts.name ? await summary(opts.name) : null;
  if (!s) return reply(`**${md(opts.name ?? "")}** isn't on the KOS list. Lucky them.`, true);
  return reply(`${describe(s)}\n${SITE}`, true);
}

/** Names on the list that start with what's typed so far. */
async function autocomplete(i: Interaction): Promise<NextResponse> {
  const { opts, focused } = subcommand(i);
  const typed = focused ? (opts[focused] ?? "") : "";
  const prefix = nameKey(typed).replace(/[\\%_]/g, "\\$&");
  const res = await db().query<{ name: string }>(
    `select name from kos_target where name_key like $1 escape '\\'
      order by last_seen_at desc limit 25`,
    [`${prefix}%`],
  );
  return NextResponse.json({
    type: ResponseType.AUTOCOMPLETE_RESULT,
    data: { choices: res.rows.map((r) => ({ name: r.name, value: r.name })) },
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  const body = await req.text();
  if (!verifyDiscord(body, req.headers.get("x-signature-ed25519"), req.headers.get("x-signature-timestamp"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const i = JSON.parse(body) as Interaction;
  try {
    if (i.type === InteractionType.PING) return NextResponse.json({ type: ResponseType.PONG });
    if (i.type === InteractionType.AUTOCOMPLETE) return await autocomplete(i);
    if (i.type === InteractionType.APPLICATION_COMMAND && i.data?.name === "kos") {
      const { sub } = subcommand(i);
      if (sub === "add") return await add(i);
      if (sub === "check") return await check(i);
    }
    return reply("I don't know that command.", true);
  } catch (err) {
    console.error("[discord]", err);
    return reply("Something went wrong. Try again in a moment.", true);
  }
}
