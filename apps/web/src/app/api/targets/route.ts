import { NextResponse } from "next/server";
import { listTargets } from "@/lib/targets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ targets: await listTargets() });
  } catch (err) {
    console.error("[targets]", err);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }
}
