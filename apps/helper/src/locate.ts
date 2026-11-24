import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

/** A game folder like World of Warcraft\_forever_. */
export interface Install {
  gameDir: string;
  addons: string;
  wtf: string;
}

const FLAVORS = ["_forever_", "_retail_"];

function asFlavor(dir: string): Install | null {
  const addons = join(dir, "Interface", "AddOns");
  if (!existsSync(addons)) return null;
  return { gameDir: dir, addons, wtf: join(dir, "WTF") };
}

/**
 * Accepts the WoW folder, the _forever_ folder inside it, or the AddOns
 * folder itself, and returns the game folder if it really holds one.
 */
export function asInstall(input: string): Install | null {
  let dir = input.trim().replace(/^"(.*)"$/, "$1").replace(/[\\/]+$/, "");
  if (!dir || !existsSync(dir)) return null;
  if (basename(dir).toLowerCase() === "addons") dir = dirname(dirname(dir));
  const direct = asFlavor(dir);
  if (direct) return direct;
  for (const flavor of FLAVORS) {
    const found = asFlavor(join(dir, flavor));
    if (found) return found;
  }
  return null;
}

/** Usual places a WoW folder sits, on every drive letter that exists. */
function usualPlaces(): string[] {
  const out: string[] = [];
  if (process.platform === "win32") {
    for (let c = 65; c <= 90; c++) {
      const d = `${String.fromCharCode(c)}:\\`;
      if (!existsSync(d)) continue;
      out.push(
        join(d, "Program Files (x86)", "World of Warcraft"),
        join(d, "Program Files", "World of Warcraft"),
        join(d, "World of Warcraft"),
        join(d, "Games", "World of Warcraft"),
      );
    }
  } else if (process.platform === "darwin") {
    out.push("/Applications/World of Warcraft", join(homedir(), "Applications", "World of Warcraft"));
  }
  out.push(join(homedir(), "World of Warcraft"));
  return out;
}

/** Where the game is running from, if it's open right now. Exact when it works. */
function fromRunningGame(): string[] {
  try {
    if (process.platform === "win32") {
      const out = execFileSync(
        "powershell",
        ["-NoProfile", "-Command", "Get-Process | Where-Object { $_.ProcessName -like 'Wow*' } | ForEach-Object { $_.Path }"],
        { encoding: "utf8", timeout: 8000, windowsHide: true },
      );
      return out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((p) => dirname(p));
    }
    const out = execFileSync("ps", ["-axo", "command"], { encoding: "utf8", timeout: 8000 });
    const hits: string[] = [];
    for (const line of out.split("\n")) {
      const m = line.match(/^(.*?World of Warcraft)\//);
      if (m && m[1]) hits.push(m[1]);
    }
    return hits;
  } catch {
    return [];
  }
}

/** Every game folder we can find, deduplicated. Empty means ask the person. */
export function findInstalls(): Install[] {
  const seen = new Set<string>();
  const found: Install[] = [];
  for (const dir of [...fromRunningGame(), ...usualPlaces()]) {
    const inst = asInstall(dir);
    if (inst && !seen.has(inst.gameDir.toLowerCase())) {
      seen.add(inst.gameDir.toLowerCase());
      found.push(inst);
    }
  }
  return found;
}

/** Every GoopKOS.lua the game has written, one per account. */
export function savedVariableFiles(inst: Install): string[] {
  const root = join(inst.wtf, "Account");
  let accounts: string[];
  try {
    accounts = readdirSync(root);
  } catch {
    return [];
  }
  return accounts
    .map((a) => join(root, a, "SavedVariables", "GoopKOS.lua"))
    .filter((p) => existsSync(p));
}
