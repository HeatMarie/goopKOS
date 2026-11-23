import { createPublicKey, verify } from "node:crypto";
import { CLASS_IDS, className } from "@/lib/classes";

/**
 * Discord signs every interaction with Ed25519. Anything that fails this
 * check is not from Discord, and Discord itself tests that we reject it
 * before it will save the endpoint URL.
 */
export function verifyDiscord(body: string, signature: string | null, timestamp: string | null): boolean {
  const hexKey = process.env.DISCORD_PUBLIC_KEY;
  if (!hexKey || !signature || !timestamp) return false;
  try {
    // Raw 32-byte key wrapped in the fixed SPKI header for Ed25519.
    const key = createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(hexKey, "hex")]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

// Discord API constants we use.
export const InteractionType = { PING: 1, APPLICATION_COMMAND: 2, AUTOCOMPLETE: 4 } as const;
export const ResponseType = { PONG: 1, MESSAGE: 4, AUTOCOMPLETE_RESULT: 8 } as const;
export const EPHEMERAL = 1 << 6;

const STRING = 3;
const SUB_COMMAND = 1;

/** /kos add and /kos check, registered once via /api/discord/register. */
export const KOS_COMMAND = {
  name: "kos",
  description: "The GoopKOS kill-on-sight list",
  type: 1,
  contexts: [0],
  integration_types: [0],
  options: [
    {
      type: SUB_COMMAND,
      name: "add",
      description: "Put someone on the KOS list",
      options: [
        { type: STRING, name: "name", description: "Full in-game name, e.g. Narshok Gristlebalm", required: true, autocomplete: true, max_length: 64 },
        {
          type: STRING, name: "what", description: "What happened (default: they killed one of us)",
          choices: [
            { name: "They killed one of us", value: "killed_me" },
            { name: "Ganked / harassing us", value: "ganked" },
            { name: "We got revenge on them", value: "revenge" },
          ],
        },
        { type: STRING, name: "why", description: "What they did", max_length: 500 },
        { type: STRING, name: "where", description: "Zone", max_length: 80 },
        {
          type: STRING, name: "class", description: "Their class",
          choices: CLASS_IDS.map((c) => ({ name: className(c), value: c })),
        },
      ],
    },
    {
      type: SUB_COMMAND,
      name: "check",
      description: "Is someone on the KOS list?",
      options: [
        { type: STRING, name: "name", description: "Their in-game name", required: true, autocomplete: true, max_length: 64 },
      ],
    },
  ],
};

export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
}

export interface Interaction {
  id: string;
  type: number;
  data?: {
    name: string;
    options?: { name: string; type: number; options?: { name: string; value: string; focused?: boolean }[] }[];
  };
  member?: { nick?: string | null; user: DiscordUser };
  user?: DiscordUser;
}

/** The name to credit: server nickname, then display name, then username. */
export function reporterName(i: Interaction): string {
  const u = i.member?.user ?? i.user;
  return i.member?.nick || u?.global_name || u?.username || "discord";
}

/** The chosen subcommand and its options as a flat map. */
export function subcommand(i: Interaction): { sub: string; opts: Record<string, string>; focused: string | null } {
  const sub = i.data?.options?.[0];
  const opts: Record<string, string> = {};
  let focused: string | null = null;
  for (const o of sub?.options ?? []) {
    opts[o.name] = String(o.value);
    if (o.focused) focused = o.name;
  }
  return { sub: sub?.name ?? "", opts, focused };
}
