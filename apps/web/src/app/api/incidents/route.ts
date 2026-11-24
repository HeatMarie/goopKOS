import { NextResponse } from "next/server";
import { validateIncident, type IngestResult } from "@goopkos/core";
import { db } from "@/lib/db";
import { isHelperAuthorized } from "@/lib/auth";
import { insertIncident } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BATCH = 2000;

export async function POST(req: Request): Promise<NextResponse> {
  if (!isHelperAuthorized(req)) {
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

      if (await insertIncident(client, incident, "addon")) result.inserted++;
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
  if (!isHelperAuthorized(req)) {
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
