import { validateIncident, type Incident } from "./types.ts";

/**
 * Writes the WebData.lua file the addon loads at login, carrying incidents
 * that were added on the website or in Discord into the game.
 *
 * WoW runs this file as code, and names and notes come from a public web
 * form. So every string is emitted with only a small set of plain characters
 * kept literal and everything else, quotes, backslashes, newlines and every
 * byte of non-ASCII UTF-8, written as a \ddd decimal escape. No input can
 * end the string literal early. Numbers must be integers. Incidents are run
 * through validateIncident again so kind, class and lengths are known-good.
 */

const SAFE = /^[A-Za-z0-9 .,'!?()\-:_/#&+*=@%]$/;

/** A Lua string literal that is safe for any input. */
export function luaString(s: string): string {
  let out = '"';
  for (const byte of new TextEncoder().encode(s)) {
    const ch = String.fromCharCode(byte);
    out += byte < 0x80 && SAFE.test(ch) ? ch : "\\" + String(byte).padStart(3, "0");
  }
  return out + '"';
}

function luaInt(n: number): string {
  if (!Number.isSafeInteger(n)) throw new Error(`not an integer: ${n}`);
  return String(n);
}

function luaIncident(i: Incident): string {
  const fields: string[] = [
    `clientId = ${luaString(i.clientId)}`,
    `name = ${luaString(i.name)}`,
    `kind = ${luaString(i.kind)}`,
    `occurredAt = ${luaInt(i.occurredAt)}`,
    `reportedBy = ${luaString(i.reportedBy)}`,
  ];
  if (i.class) fields.push(`class = ${luaString(i.class)}`);
  if (i.level !== null) fields.push(`level = ${luaInt(i.level)}`);
  if (i.zone) fields.push(`zone = ${luaString(i.zone)}`);
  if (i.note) fields.push(`note = ${luaString(i.note)}`);
  return `    { ${fields.join(", ")} },`;
}

/**
 * The whole WebData.lua file. Anything that fails validation is dropped, not
 * written, so a bad row on the server can never break the addon's load.
 */
export function webDataLua(raw: unknown[], generatedAt: number): { lua: string; count: number } {
  const lines: string[] = [];
  for (const r of raw) {
    const v = validateIncident(r);
    if ("error" in v) continue;
    lines.push(luaIncident(v));
  }
  const lua = [
    "-- Written by the GoopKOS watcher from the website. Do not edit;",
    "-- it is replaced every time the watcher syncs.",
    "GoopKOSWebData = {",
    `  generatedAt = ${luaInt(generatedAt)},`,
    "  incidents = {",
    ...lines,
    "  },",
    "}",
    "",
  ].join("\n");
  return { lua, count: lines.length };
}
