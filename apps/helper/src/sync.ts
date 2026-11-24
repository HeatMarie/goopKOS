import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  KosApiError,
  KosClient,
  LuaParseError,
  parseSavedVariables,
  readIncidents,
  validateIncident,
  webDataLua,
  type Incident,
} from "@goopkos/core";
import { statePath } from "./config.ts";
import { savedVariableFiles, type Install } from "./locate.ts";

const PRUNE_AFTER_DAYS = 90;
const POLL_MS = 3000;
const SETTLE_MS = 1500;
const PULL_MS = 60_000;
const WEBDATA = "WebData.lua";

/** clientId -> occurredAt for everything already uploaded, so it isn't re-sent. */
type Sent = Record<string, number>;

function loadSent(): Sent {
  try {
    return JSON.parse(readFileSync(statePath(), "utf8"))?.sent ?? {};
  } catch {
    return {};
  }
}

function saveSent(sent: Sent): void {
  const cutoff = Math.floor(Date.now() / 1000) - PRUNE_AFTER_DAYS * 86_400;
  for (const [id, ts] of Object.entries(sent)) if (ts < cutoff) delete sent[id];
  writeFileSync(statePath(), JSON.stringify({ sent }), "utf8");
}

const webDataBody = (lua: string) => lua.replace(/generatedAt = \d+/, "");

export type Log = (line: string) => void;

/**
 * Both directions in one place. Up: kills the game saved to disk go to the
 * site. Down: what the site and Discord hold goes into WebData.lua for the
 * addon to load. Same logic as apps/watcher, minus the Discord feed, and it
 * covers every account in the WTF folder.
 */
export class Syncer {
  private client: KosClient;
  private install: Install;
  private log: Log;
  private sent = loadSent();
  private busy = false;
  private lastWebData = "";
  private signatures = new Map<string, string>();
  private timers: NodeJS.Timeout[] = [];

  constructor(site: string, apiKey: string, install: Install, log: Log) {
    this.client = new KosClient({ baseUrl: site, apiKey });
    this.install = install;
    this.log = log;
    try {
      this.lastWebData = webDataBody(readFileSync(this.webDataPath(), "utf8"));
    } catch {
      /* first run */
    }
  }

  private webDataPath(): string {
    return join(this.install.addons, "GoopKOS", WEBDATA);
  }

  /** Uploads new incidents from every saved file. Returns how many went up. */
  async upload(): Promise<number> {
    if (this.busy) return 0;
    this.busy = true;
    let total = 0;
    try {
      for (const file of savedVariableFiles(this.install)) {
        let source: string;
        try {
          source = readFileSync(file, "utf8");
        } catch {
          continue; // locked while the game flushes; next poll gets it
        }
        let fresh: Incident[] = [];
        try {
          for (const raw of readIncidents(parseSavedVariables(source))) {
            const v = validateIncident(raw);
            if ("error" in v || this.sent[v.clientId] !== undefined) continue;
            fresh.push(v);
          }
        } catch (err) {
          if (err instanceof LuaParseError) continue; // half-written file
          throw err;
        }
        if (fresh.length === 0) continue;

        const result = await this.client.sendIncidents(fresh);
        const refused = new Set(result.rejected.map((r) => r.clientId));
        for (const inc of fresh) if (!refused.has(inc.clientId)) this.sent[inc.clientId] = inc.occurredAt;
        saveSent(this.sent);
        total += result.inserted;
        this.log(`sent ${fresh.length} kill(s) to the site (${result.inserted} new)`);
      }
    } catch (err) {
      this.log(`could not send kills: ${describe(err)}`);
    } finally {
      this.busy = false;
    }
    return total;
  }

  /** Writes the site's list into WebData.lua. Returns the number of entries if it changed. */
  async pull(): Promise<number> {
    try {
      const { generatedAt, incidents } = await this.client.exportIncidents();
      const { lua, count } = webDataLua(incidents, generatedAt);
      if (webDataBody(lua) === this.lastWebData) return 0;
      if (!existsSync(join(this.install.addons, "GoopKOS"))) return 0;
      const target = this.webDataPath();
      writeFileSync(target + ".tmp", lua, "utf8");
      renameSync(target + ".tmp", target);
      this.lastWebData = webDataBody(lua);
      this.log(`the site's list changed: ${count} entries ready. Type /reload in game to load them.`);
      return count;
    } catch (err) {
      this.log(`could not fetch the site's list: ${describe(err)}`);
      return 0;
    }
  }

  /** One round, for "only when I open it". */
  async once(): Promise<void> {
    await this.upload();
    await this.pull();
  }

  private signature(): string {
    return savedVariableFiles(this.install)
      .map((f) => {
        try {
          const st = statSync(f);
          return `${f}:${st.size}:${st.mtimeMs}`;
        } catch {
          return f;
        }
      })
      .join("|");
  }

  /** Keeps going: watch the saved files, refresh the site's list. */
  startWatching(): void {
    let last = this.signature();
    let settle: NodeJS.Timeout | null = null;
    this.timers.push(
      setInterval(() => {
        const sig = this.signature();
        if (sig === last) return;
        last = sig;
        // The game writes the file in one go, but give it a moment to finish.
        if (settle) clearTimeout(settle);
        settle = setTimeout(() => void this.upload(), SETTLE_MS);
      }, POLL_MS),
      setInterval(() => void this.pull(), PULL_MS),
    );
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }
}

function describe(err: unknown): string {
  if (err instanceof KosApiError) return `site error ${err.status}`;
  return err instanceof Error ? err.message : String(err);
}
