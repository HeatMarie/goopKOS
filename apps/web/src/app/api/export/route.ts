import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAuthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Matches the addon's PRUNE_DAYS: older incidents would be dropped on load. */
const DAYS = 30;

interface Row {
  client_id: string;
  name: string;
  class: string | null;
  level: number | null;
  kind: string;
  note: string | null;
  zone: string | null;
  occurred_at: string; // bigint arrives as a string
  reported_by: string;
}

/**
 * Recent incidents, shaped like the addon's own entries, for the watcher to
 * write into WebData.lua so web and Discord adds reach the game. Watcher key
 * required, same as uploading.
 */
export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const res = await db().query<Row>(
    `select i.client_id, t.name, t.class, t.level, i.kind, i.note, i.zone,
            extract(epoch from i.occurred_at)::bigint as occurred_at, i.reported_by
       from kos_incident i
       join kos_target t on t.id = i.target_id
      where i.occurred_at >= now() - make_interval(days => $1)
      order by i.occurred_at`,
    [DAYS],
  );

  return NextResponse.json({
    generatedAt: Math.floor(Date.now() / 1000),
    incidents: res.rows.map((r) => ({
      clientId: r.client_id,
      name: r.name,
      class: r.class,
      level: r.level,
      kind: r.kind,
      note: r.note,
      zone: r.zone,
      occurredAt: Number(r.occurred_at),
      reportedBy: r.reported_by,
    })),
  });
}
