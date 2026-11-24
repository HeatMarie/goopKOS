import { NextResponse } from "next/server";
import { ADDON_VERSION } from "@/lib/addonVersion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the GoopKOS program asks for on every start: the current addon version
 * and download, and the shared helper key. Public on purpose, like the zip it
 * points at. The key can only upload incidents and read the export (see
 * isHelperAuthorized); set GOOPKOS_HELPER_KEY in Vercel, and change it there
 * to cut off a leaked one. Installs pick up the new key on their next start.
 */
export async function GET(): Promise<NextResponse> {
  const apiKey = process.env.GOOPKOS_HELPER_KEY ?? "";
  if (!apiKey) {
    return NextResponse.json({ error: "helper key not configured" }, { status: 503 });
  }
  return NextResponse.json(
    { addonVersion: ADDON_VERSION, zipPath: "/GoopKOS.zip", apiKey },
    { headers: { "cache-control": "no-store" } },
  );
}
