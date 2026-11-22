import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Remove a target and, by cascade, every incident about them. Open to anyone
 * with the link, by choice. The page asks for a second click first.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  try {
    const res = await db().query("delete from kos_target where id = $1", [id]);
    if (res.rowCount === 0) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[delete]", err);
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
