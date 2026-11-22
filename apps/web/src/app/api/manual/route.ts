import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { validateIncident } from "@goopkos/core";
import { db } from "@/lib/db";
import { insertIncident } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Add an incident from the web page or the Discord Activity. Open to anyone
 * with the link, by choice: it is a stopgap until everyone runs the addon.
 * Same validation and insert path as the watcher upload, with a clientId
 * minted here; the form disables its button while saving so one click is
 * one incident.
 */
export async function POST(req: Request): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const reportedBy =
    typeof body.reportedBy === "string" && body.reportedBy.trim() ? body.reportedBy : "web";

  const incident = validateIncident({
    clientId: `web-${randomUUID()}`,
    name: body.name,
    kind: body.kind,
    class: body.class || undefined,
    level: typeof body.level === "number" ? body.level : undefined,
    zone: body.zone,
    note: body.note,
    occurredAt: Math.floor(Date.now() / 1000),
    reportedBy,
  });
  if ("error" in incident) {
    return NextResponse.json({ error: incident.error }, { status: 400 });
  }

  const client = await db().connect();
  try {
    await client.query("begin");
    await insertIncident(client, incident, "web");
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    console.error("[manual]", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true, clientId: incident.clientId });
}
