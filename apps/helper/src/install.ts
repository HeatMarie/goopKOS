import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { unzipSync } from "fflate";

export interface RemoteConfig {
  addonVersion: string;
  zipPath: string;
  apiKey: string;
}

/** Asks the site what the newest addon is and for the shared helper key. */
export async function fetchRemoteConfig(site: string): Promise<RemoteConfig> {
  const res = await fetch(`${site}/api/helper/config`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`the site answered ${res.status}`);
  const j = (await res.json()) as Partial<RemoteConfig>;
  if (!j.addonVersion || !j.zipPath || !j.apiKey) throw new Error("the site's answer was incomplete");
  return { addonVersion: j.addonVersion, zipPath: j.zipPath, apiKey: j.apiKey };
}

/** The ## Version line of the installed addon, or null if it isn't installed. */
export function installedVersion(addons: string): string | null {
  try {
    const toc = readFileSync(join(addons, "GoopKOS", "GoopKOS.toc"), "utf8");
    return toc.match(/^## Version:\s*(\S+)/m)?.[1] ?? "0";
  } catch {
    return null;
  }
}

/** > 0 when a is newer than b. Compares dotted numbers: 0.10 beats 0.9. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export type InstallResult = "installed" | "updated" | "current";

/**
 * Installs the addon, or updates it when the site has a newer one. Never
 * downgrades, so a copy you are editing locally is left alone. Only writes
 * files under AddOns\GoopKOS; saved data lives in WTF and isn't touched.
 */
export async function installAddon(site: string, remote: RemoteConfig, addons: string): Promise<InstallResult> {
  const have = installedVersion(addons);
  if (have !== null && compareVersions(remote.addonVersion, have) <= 0) return "current";

  const res = await fetch(site + remote.zipPath, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`downloading the addon failed (${res.status})`);
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));

  const root = resolve(addons);
  let wrote = 0;
  for (const [name, data] of Object.entries(files)) {
    const rel = name.replace(/\\/g, "/");
    if (rel.endsWith("/")) continue; // folder entry
    if (!rel.startsWith("GoopKOS/")) continue;
    const target = resolve(root, rel);
    // Refuse anything that would land outside the AddOns folder.
    if (!target.startsWith(root + sep)) throw new Error(`unsafe path in the zip: ${name}`);
    // The zip's WebData.lua is an empty stub; keep the real one the sync wrote.
    if (rel === "GoopKOS/WebData.lua" && existsSync(target)) continue;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target + ".tmp", data);
    renameSync(target + ".tmp", target);
    wrote++;
  }
  if (wrote === 0 || !existsSync(join(root, "GoopKOS", "GoopKOS.toc"))) {
    throw new Error("the download did not contain the addon");
  }
  return have === null ? "installed" : "updated";
}
