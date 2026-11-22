import { NextResponse } from "next/server";
import { validateIncident, nameKey, type IngestResult } from "@goopkos/core";
import { db } from "@/lib/db";
import { isAuthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BATCH = 2000;

export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const list = (body as { incidents?: unknown })?.incidents;
  if (!Array.isArray(list)) {
    return NextResponse.json({ error: "expected { incidents: [...] }" }, { status: 400 });
  }
  if (list.length > MAX_BATCH) {
    return NextResponse.json({ error: `batch too large (max ${MAX_BATCH})` }, { status: 413 });
  }

  const result: IngestResult = {
    received: list.length,
    inserted: 0,
    duplicates: 0,
    rejected: [],
  };

  const client = await db().connect();
  try {
    await client.query("begin");

    for (const candidate of list) {
      const incident = validateIncident(candidate);
      if ("error" in incident) {
        const id =
          typeof (candidate as { clientId?: unknown })?.clientId === "string"
            ? (candidate as { clientId: string }).clientId
            : "(unknown)";
        result.rejected.push({ clientId: id, reason: incident.error });
        continue;
      }

      const targetRes = await client.query<{ id: string }>(
        `insert into kos_target (name, name_key, class, level, first_seen_at, last_seen_at)
         values ($1, $2, $3, $4, to_timestamp($5), to_timestamp($5))
         on conflict (name_key) do update set
           name         = excluded.name,
           class        = coalesce(excluded.class, kos_target.class),
           level        = coalesce(excluded.level, kos_target.level),
           first_seen_at = least(kos_target.first_seen_at, excluded.first_seen_at),
           last_seen_at  = greatest(kos_target.last_seen_at, excluded.last_seen_at)
         returning id`,
        [
          incident.name,
          nameKey(incident.name),
          incident.class,
          incident.level,
          incident.occurredAt,
        ],
      );

      const targetId = targetRes.rows[0]!.id;

      const insertRes = await client.query(
        `insert into kos_incident
           (target_id, kind, note, zone, occurred_at, reported_by, source, client_id)
         values ($1, $2, $3, $4, to_timestamp($5), $6, $7, $8)
         on conflict (client_id) do nothing
         returning id`,
        [
          targetId,
          incident.kind,
          incident.note,
          incident.zone,
          incident.occurredAt,
          incident.reportedBy,
          "addon",
          incident.clientId,
        ],
      );

      if (insertRes.rowCount === 1) result.inserted++;
      else result.duplicates++;
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    console.error("[ingest]", err);
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  } finally {
    client.release();
  }

  return NextResponse.json(result);
}

/** Every clientId the server holds, so a watcher can rebuild its state. */
export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const since = Number(new URL(req.url).searchParams.get("since") ?? 0);
  const res = await db().query<{ client_id: string }>(
    Number.isFinite(since) && since > 0
      ? `select client_id from kos_incident where occurred_at >= to_timestamp($1)`
      : `select client_id from kos_incident`,
    Number.isFinite(since) && since > 0 ? [since] : [],
  );

  return NextResponse.json({ clientIds: res.rows.map((r) => r.client_id) });
}
