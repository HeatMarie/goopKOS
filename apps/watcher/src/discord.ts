// Discord channel -> KOS list. Reads new messages in one channel over the
// REST API every few seconds (no gateway, nothing hosted), turns lines that
// look like character names into incidents and reacts ✅ to each message it
// took names from. Runs inside the watcher, so it only runs on Heat's PC;
// whatever was typed while the PC was off is caught up on the next start.
//
// Incidents go through the same /api/incidents upsert as the addon, with
// clientId discord-msg-<messageId>-<n>, so re-reading a message is harmless.

import { validateIncident, type Incident, type KosClient } from "@goopkos/core";

const API = "https://discord.com/api/v10";
const FIRST_RUN_BACKFILL = 50;   // messages to look back on the very first run
const DONE = "✅";

/** Chat that would otherwise pass as a one-word name. */
const NOT_NAMES = new Set([
  "lol", "lmao", "lmfao", "rofl", "ok", "okay", "kk", "k", "yes", "yep", "yeah", "no", "nope", "nah",
  "ty", "thx", "thanks", "gg", "nice", "same", "what", "why", "who", "where", "when", "how", "this",
  "that", "him", "her", "them", "they", "he", "she", "it", "me", "us", "we", "you", "omg", "wtf",
  "haha", "hah", "hey", "hi", "hello", "bye", "sure", "cool", "rip", "oof", "ugh", "idk", "brb",
  "and", "the", "also", "again", "here", "there", "too", "lmk", "ikr", "true", "facts", "bet",
  "one", "my", "your", "our", "is", "was", "got", "get", "go", "on", "in", "at", "to", "of", "a", "an",
  "good", "bad", "great", "love", "hate", "now", "later", "soon", "night", "morning", "dead", "died",
]);

// A Forever character: one or two words of letters (accents and apostrophes ok).
const WORD = "[\\p{L}][\\p{L}'’]{1,23}";
const NAME = new RegExp(`^${WORD}(?: ${WORD})?$`, "u");

export interface Parsed {
  name: string;
  kind: "killed_me" | "revenge";
  note: string | null;
}

function properCase(name: string): string {
  return name
    .split(" ")
    .map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Names in one message: one per line or comma-separated, each optionally
 * followed by " - why". A line starting with "revenge" or "got" is a
 * revenge. If any line isn't a name, the whole message is treated as chat
 * and ignored, so a sentence never half-adds.
 */
export function parseNames(content: string, known: Map<string, string>): Parsed[] {
  const lines = content.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0);
  const out: Parsed[] = [];

  for (const raw of lines) {
    let line = raw.replace(/^(?:[-*•>]|\d+[.)])\s*/, "").trim(); // list bullets / "1." numbering
    let kind: Parsed["kind"] = "killed_me";
    const rev = line.match(/^(?:revenge|got)[:\s]+(.*)$/i);
    if (rev) {
      kind = "revenge";
      line = rev[1]!.trim();
    }
    // "A, B - why" or "A: why": names before the first separator, note after
    // (commas in the note stay in the note). The note goes on each name.
    const sep = line.match(/\s+[-–—]\s+|\s*:\s+/);
    const head = sep ? line.slice(0, sep.index) : line;
    const note = sep ? line.slice(sep.index! + sep[0].length).trim().slice(0, 500) || null : null;

    for (const part of head.split(",")) {
      const name = part.replace(/\s+/g, " ").trim();
      if (!name) continue;
      if (!NAME.test(name) || name.toLowerCase().split(" ").some((w) => NOT_NAMES.has(w))) return [];
      out.push({ name: known.get(name.toLowerCase()) ?? properCase(name), kind, note });
    }
  }
  return out.length > 25 ? [] : out;
}

interface Message {
  id: string;
  content: string;
  timestamp: string;
  author: { id: string; username: string; global_name?: string | null; bot?: boolean };
  reactions?: { emoji: { name: string }; me: boolean }[];
}

export interface DiscordFeedOptions {
  token: string;
  channelId: string;
  client: KosClient;
  /** lowercase -> proper-case names already on the list. */
  knownNames: () => Map<string, string>;
  getLastId: () => string | undefined;
  setLastId: (id: string) => void;
}

export function startDiscordFeed(opts: DiscordFeedOptions, everyMs: number): void {
  const headers = { Authorization: `Bot ${opts.token}`, "User-Agent": "GoopKOS-watcher (private, 1.0)" };
  let busy = false;
  let warned = false;

  async function discord<T>(path: string, init: RequestInit = {}): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(API + path, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
      if (res.status === 429) {
        const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
        await new Promise((r) => setTimeout(r, Math.ceil((body.retry_after ?? 1) * 1000)));
        continue;
      }
      if (!res.ok) throw new Error(`discord ${res.status} on ${path.split("?")[0]}: ${(await res.text()).slice(0, 200)}`);
      return (res.status === 204 ? undefined : await res.json()) as T;
    }
    throw new Error("discord rate limit");
  }

  async function fetchNew(): Promise<Message[]> {
    const last = opts.getLastId();
    if (!last) {
      const msgs = await discord<Message[]>(`/channels/${opts.channelId}/messages?limit=${FIRST_RUN_BACKFILL}`);
      return msgs;
    }
    const all: Message[] = [];
    let after = last;
    for (let page = 0; page < 10; page++) {
      const msgs = await discord<Message[]>(`/channels/${opts.channelId}/messages?after=${after}&limit=100`);
      if (msgs.length === 0) break;
      all.push(...msgs);
      after = msgs.reduce((m, x) => (BigInt(x.id) > BigInt(m) ? x.id : m), after);
      if (msgs.length < 100) break;
    }
    return all;
  }

  async function tick(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const msgs = (await fetchNew()).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
      warned = false;
      for (const m of msgs) {
        if (m.author.bot || m.reactions?.some((r) => r.me && r.emoji.name === DONE)) {
          opts.setLastId(m.id);
          continue;
        }
        const names = parseNames(m.content, opts.knownNames());
        if (names.length > 0) {
          const reporter = (m.author.global_name || m.author.username).slice(0, 64);
          const occurredAt = Math.floor(Date.parse(m.timestamp) / 1000);
          const incidents: Incident[] = [];
          names.forEach((n, i) => {
            const v = validateIncident({
              clientId: `discord-msg-${m.id}-${i}`,
              name: n.name,
              kind: n.kind,
              note: n.note,
              occurredAt,
              reportedBy: reporter,
            });
            if (!("error" in v)) incidents.push(v);
          });
          // Throws on failure: lastId isn't advanced, so this message retries.
          const result = await opts.client.sendIncidents(incidents);
          if (result.rejected.length > 0) {
            // These passed our own validation, so the site is just older than
            // the watcher (e.g. revenge before the deploy). Retry later.
            throw new Error(`site refused ${result.rejected.length} name(s) (${result.rejected[0]!.reason}); will retry`);
          }
          console.log(`[kos] discord: ${reporter} added ${names.map((n) => n.name).join(", ")}`);
          await discord(`/channels/${opts.channelId}/messages/${m.id}/reactions/${encodeURIComponent(DONE)}/@me`, { method: "PUT" })
            .catch((err) => console.warn(`[kos] discord: couldn't react: ${err.message}`));
        }
        opts.setLastId(m.id);
      }
    } catch (err) {
      if (!warned) console.error(`[kos] discord feed: ${err instanceof Error ? err.message : err}`);
      warned = true;   // say it once, not every few seconds
    } finally {
      busy = false;
    }
  }

  void tick();
  setInterval(() => void tick(), everyMs);
  console.log(`[kos] reading names from Discord channel ${opts.channelId} every ${everyMs / 1000}s`);
}
