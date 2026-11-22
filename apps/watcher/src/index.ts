import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSavedVariables,
  readIncidents,
  validateIncident,
  webDataLua,
  KosClient,
  KosApiError,
  LuaParseError,
  type Incident,
} from "@goopkos/core";
import { findSavedVariables } from "./find.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(HERE, "..", "watcher-state.json");
const PRUNE_AFTER_DAYS = 90;
const SETTLE_MS = 1500;
const WEBDATA = "WebData.lua";

/**
 * The installed addon folder, where WebData.lua goes. Derived from the
 * SavedVariables path: <game>\WTF\Account\<acct>\SavedVariables\GoopKOS.lua
 * sits four levels below <game>, and the addon is <game>\Interface\AddOns\
 * GoopKOS. GOOPKOS_ADDON_DIR overrides it. Null if it isn't there.
 */
function resolveAddonDir(savedVars: string): string | null {
  const dir =
    process.env.GOOPKOS_ADDON_DIR ||
    resolve(dirname(savedVars), "..", "..", "..", "..", "Interface", "AddOns", "GoopKOS");
  return existsSync(join(dir, "GoopKOS.toc")) ? dir : null;
}

/** WebData.lua minus its timestamp, to tell whether a rewrite changes anything. */
function webDataBody(lua: string): string {
  return lua.replace(/generatedAt = \d+/, "");
}

interface State {
  /** clientId -> the incident's occurredAt, so old ids can be pruned. */
  sent: Record<string, number>;
}

function loadState(): State {
  if (!existsSync(STATE_PATH)) return { sent: {} };
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, "utf8"));
    return { sent: parsed?.sent ?? {} };
  } catch {
    console.warn("[kos] state file unreadable, starting fresh");
    return { sent: {} };
  }
}

function saveState(state: State): void {
  const cutoff = Math.floor(Date.now() / 1000) - PRUNE_AFTER_DAYS * 86_400;
  for (const [id, ts] of Object.entries(state.sent)) {
    if (ts < cutoff) delete state.sent[id];
  }
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state), "utf8");
}

function resolveSavedVariables(): string {
  const fromEnv = process.env.GOOPKOS_SAVEDVARS;
  if (fromEnv) {
    if (!existsSync(fromEnv)) {
      console.error(`[kos] GOOPKOS_SAVEDVARS points at a file that does not exist:\n      ${fromEnv}`);
      process.exit(1);
    }
    return fromEnv;
  }

  console.log("[kos] GOOPKOS_SAVEDVARS not set, searching for GoopKOS.lua...");
  const hits = findSavedVariables();
  if (hits.length === 0) {
    console.error("[kos] Could not find GoopKOS.lua.");
    console.error("      Log in with the addon enabled, run /reload once, then try again");
    console.error("      or set GOOPKOS_SAVEDVARS in .env to the full path.");
    process.exit(1);
  }
  if (hits.length > 1) {
    console.log("[kos] Found several. Using the first; set GOOPKOS_SAVEDVARS to pick another:");
    for (const h of hits) console.log("        " + h);
  }
  console.log(`[kos] Watching ${hits[0]}`);
  return hits[0]!;
}

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    console.error(`[kos] ${name} is not set. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  const savedVars = resolveSavedVariables();
  const client = new KosClient({
    baseUrl: env("GOOPKOS_API_URL", "http://localhost:3000"),
    apiKey: env("GOOPKOS_API_KEY"),
  });
  const pollMs = Number(process.env.GOOPKOS_POLL_MS ?? 3000);
  const state = loadState();

  let lastSignature = "";
  let busy = false;

  async function sync(reason: string): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      let source: string;
      try {
        source = readFileSync(savedVars, "utf8");
      } catch {
        return; // file momentarily locked during the game's flush
      }

      let incidents: Incident[];
      try {
        const globals = parseSavedVariables(source);
        const raw = readIncidents(globals);
        incidents = [];
        let rejected = 0;
        for (const r of raw) {
          const v = validateIncident(r);
          if ("error" in v) { rejected++; continue; }
          if (state.sent[v.clientId] !== undefined) continue;
          incidents.push(v);
        }
        if (rejected > 0) console.warn(`[kos] skipped ${rejected} malformed entries`);
      } catch (err) {
        if (err instanceof LuaParseError) {
          // Usually a half-written file mid-flush. The next poll picks it up.
          return;
        }
        throw err;
      }

      if (incidents.length === 0) return;

      console.log(`[kos] ${reason}: sending ${incidents.length} incident(s)`);
      const result = await client.sendIncidents(incidents);
      for (const inc of incidents) state.sent[inc.clientId] = inc.occurredAt;
      saveState(state);
      console.log(
        `[kos] accepted ${result.inserted} new, ${result.duplicates} already known` +
          (result.rejected.length ? `, ${result.rejected.length} rejected` : ""),
      );
    } catch (err) {
      if (err instanceof KosApiError) {
        console.error(`[kos] api error ${err.status}: ${err.message}`);
      } else {
        console.error("[kos]", err instanceof Error ? err.message : err);
      }
      // Nothing is marked sent, so the next poll retries the same incidents.
    } finally {
      busy = false;
    }
  }

  function signature(): string {
    try {
      const st = statSync(savedVars);
      return `${st.size}:${st.mtimeMs}`;
    } catch {
      return "";
    }
  }

  // Site -> game: every so often, write recent incidents from the website and
  // Discord into WebData.lua, which the addon merges by clientId at load.
  const addonDir = resolveAddonDir(savedVars);
  const pullMs = Number(process.env.GOOPKOS_PULL_MS ?? 60_000);
  let lastWebData = "";
  if (addonDir) {
    try {
      lastWebData = webDataBody(readFileSync(join(addonDir, WEBDATA), "utf8"));
    } catch {
      /* first run: no file yet */
    }
  } else {
    console.warn("[kos] addon folder not found next to the saved file; site -> game is off.");
    console.warn("      Set GOOPKOS_ADDON_DIR in .env to the AddOns\\GoopKOS folder to turn it on.");
  }

  async function pull(): Promise<void> {
    if (!addonDir) return;
    try {
      const { generatedAt, incidents } = await client.exportIncidents();
      const { lua, count } = webDataLua(incidents, generatedAt);
      if (webDataBody(lua) === lastWebData) return;
      const target = join(addonDir, WEBDATA);
      writeFileSync(target + ".tmp", lua, "utf8");
      renameSync(target + ".tmp", target);
      lastWebData = webDataBody(lua);
      console.log(`[kos] site -> game: ${count} incident(s) in ${WEBDATA}. /reload in game to load them.`);
    } catch (err) {
      const msg = err instanceof KosApiError ? `api error ${err.status}: ${err.message}` : err instanceof Error ? err.message : String(err);
      console.error(`[kos] site -> game failed: ${msg}`);
    }
  }

  lastSignature = signature();
  await sync("startup");
  await pull();
  setInterval(() => void pull(), pullMs);

  let settleTimer: NodeJS.Timeout | null = null;
  setInterval(() => {
    const sig = signature();
    if (sig === "" || sig === lastSignature) return;
    lastSignature = sig;
    // WoW writes the file in one go, but give it a moment to finish.
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => void sync("file changed"), SETTLE_MS);
  }, pollMs);

  console.log(`[kos] watching every ${pollMs}ms. Ctrl+C to stop.`);
  if (addonDir) console.log(`[kos] site -> game every ${pullMs / 1000}s into ${join(addonDir, WEBDATA)}`);
}

main().catch((err) => {
  console.error("[kos] fatal:", err);
  process.exit(1);
});
