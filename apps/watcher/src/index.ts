import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSavedVariables,
  readIncidents,
  validateIncident,
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

  lastSignature = signature();
  await sync("startup");

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
}

main().catch((err) => {
  console.error("[kos] fatal:", err);
  process.exit(1);
});
