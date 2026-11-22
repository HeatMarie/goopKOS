import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const TARGET = "GoopKOS.lua";
const MAX_DEPTH = 7;

/** Plausible places a WoW install sits, newest-looking first. */
function roots(): string[] {
  const out: string[] = [];
  if (process.platform === "win32") {
    for (const drive of ["C:", "D:", "E:"]) {
      out.push(
        `${drive}\\Program Files (x86)\\World of Warcraft`,
        `${drive}\\Program Files\\World of Warcraft`,
        `${drive}\\World of Warcraft`,
        `${drive}\\Games\\World of Warcraft`,
      );
    }
  } else if (process.platform === "darwin") {
    out.push("/Applications/World of Warcraft");
  }
  out.push(join(homedir(), "World of Warcraft"));
  return out.filter((p) => existsSync(p));
}

function walk(dir: string, depth: number, hits: string[]): void {
  if (depth > MAX_DEPTH || hits.length > 8) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, depth + 1, hits);
    } else if (entry === TARGET) {
      hits.push(full);
    }
  }
}

/** Search likely install roots for the addon's saved-variables file. */
export function findSavedVariables(): string[] {
  const hits: string[] = [];
  for (const root of roots()) walk(root, 0, hits);
  return hits;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const hits = findSavedVariables();
  if (hits.length === 0) {
    console.log("No GoopKOS.lua found. Log in with the addon enabled and /reload once,");
    console.log("then run this again, or set GOOPKOS_SAVEDVARS by hand.");
  } else {
    console.log("Found:");
    for (const h of hits) console.log("  " + h);
  }
}
