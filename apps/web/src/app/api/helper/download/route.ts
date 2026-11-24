import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO = process.env.GOOPKOS_GITHUB_REPO || "HeatMarie/goopKOS";
const ASSETS = { win: "goopkos-helper-win-x64.zip", mac: "goopkos-helper-mac-arm64.zip" } as const;
type Os = keyof typeof ASSETS;

/** The newest release's files, by name. Empty if there's none or the repo is private. */
async function latestAssets(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "goopkos-site" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return {};
    const rel = (await res.json()) as { assets?: { name: string; browser_download_url: string }[] };
    return Object.fromEntries((rel.assets ?? []).map((a) => [a.name, a.browser_download_url]));
  } catch {
    return {};
  }
}

/**
 * Without ?os: which downloads exist right now, for the download panel.
 * With ?os=win or ?os=mac: send the person to that file on the latest release.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const assets = await latestAssets();
  const os = new URL(req.url).searchParams.get("os");

  if (os === null) {
    return NextResponse.json({ win: !!assets[ASSETS.win], mac: !!assets[ASSETS.mac] });
  }
  if (os !== "win" && os !== "mac") {
    return NextResponse.json({ error: "os must be win or mac" }, { status: 400 });
  }
  const url = assets[ASSETS[os as Os]];
  if (!url) return NextResponse.json({ error: "not released yet" }, { status: 404 });
  return NextResponse.redirect(url, 302);
}
