/**
 * A parser for the subset of Lua that WoW writes into SavedVariables.
 *
 * This file never executes the input. The .lua file arrives from someone
 * else's machine, and handing it to eval or a Lua VM would be handing them
 * your process. It is tokenised and parsed as data, with a depth cap and a
 * size cap so a hostile or corrupt file cannot hang the watcher.
 */

export type LuaValue =
  | string
  | number
  | boolean
  | null
  | LuaValue[]
  | { [key: string]: LuaValue };

const MAX_BYTES = 32 * 1024 * 1024;
const MAX_DEPTH = 32;

export class LuaParseError extends Error {
  readonly offset: number;
  constructor(message: string, offset: number) {
    super(`${message} (at offset ${offset})`);
    this.name = "LuaParseError";
    this.offset = offset;
  }
}

type TokKind =
  | "{" | "}" | "[" | "]" | "=" | "," | ";"
  | "string" | "number" | "name" | "true" | "false" | "nil" | "eof";

interface Tok {
  kind: TokKind;
  value?: string | number;
  pos: number;
}

const NAME_START = /[A-Za-z_]/;
const NAME_PART = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i]!;

    if (c === " " || c === "\t" || c === "\r" || c === "\n") { i++; continue; }

    if (c === "-" && src[i + 1] === "-") {
      i += 2;
      if (src[i] === "[" && src[i + 1] === "[") {
        const end = src.indexOf("]]", i + 2);
        i = end === -1 ? n : end + 2;
      } else {
        while (i < n && src[i] !== "\n") i++;
      }
      continue;
    }

    if (c === "{" || c === "}" || c === "[" || c === "]" || c === "=" || c === "," || c === ";") {
      // "[" starts a key only when it is not a long-bracket string
      toks.push({ kind: c as TokKind, pos: i });
      i++;
      continue;
    }

    if (c === '"' || c === "'") {
      const quote = c;
      let out = "";
      i++;
      while (i < n && src[i] !== quote) {
        const ch = src[i]!;
        if (ch === "\\") {
          const esc = src[i + 1];
          i += 2;
          switch (esc) {
            case "n": out += "\n"; break;
            case "t": out += "\t"; break;
            case "r": out += "\r"; break;
            case "a": out += "\x07"; break;
            case "b": out += "\b"; break;
            case "f": out += "\f"; break;
            case "v": out += "\v"; break;
            case "\\": out += "\\"; break;
            case '"': out += '"'; break;
            case "'": out += "'"; break;
            case "\n": out += "\n"; break;
            default:
              if (esc !== undefined && DIGIT.test(esc)) {
                let digits = esc;
                while (digits.length < 3 && src[i] !== undefined && DIGIT.test(src[i]!)) {
                  digits += src[i]!;
                  i++;
                }
                out += String.fromCharCode(parseInt(digits, 10));
              } else if (esc !== undefined) {
                out += esc;
              }
          }
          continue;
        }
        out += ch;
        i++;
      }
      if (i >= n) throw new LuaParseError("unterminated string", toks.length ? toks[toks.length - 1]!.pos : 0);
      i++;
      toks.push({ kind: "string", value: out, pos: i });
      continue;
    }

    if (DIGIT.test(c) || (c === "-" && src[i + 1] !== undefined && DIGIT.test(src[i + 1]!))) {
      const start = i;
      if (c === "-") i++;
      if (src[i] === "0" && (src[i + 1] === "x" || src[i + 1] === "X")) {
        i += 2;
        while (i < n && /[0-9a-fA-F]/.test(src[i]!)) i++;
      } else {
        while (i < n && DIGIT.test(src[i]!)) i++;
        if (src[i] === ".") { i++; while (i < n && DIGIT.test(src[i]!)) i++; }
        if (src[i] === "e" || src[i] === "E") {
          i++;
          if (src[i] === "+" || src[i] === "-") i++;
          while (i < n && DIGIT.test(src[i]!)) i++;
        }
      }
      const text = src.slice(start, i);
      const num = Number(text);
      if (!Number.isFinite(num)) throw new LuaParseError(`bad number "${text}"`, start);
      toks.push({ kind: "number", value: num, pos: start });
      continue;
    }

    if (NAME_START.test(c)) {
      const start = i;
      while (i < n && NAME_PART.test(src[i]!)) i++;
      const word = src.slice(start, i);
      if (word === "true" || word === "false" || word === "nil") {
        toks.push({ kind: word as TokKind, pos: start });
      } else {
        toks.push({ kind: "name", value: word, pos: start });
      }
      continue;
    }

    throw new LuaParseError(`unexpected character "${c}"`, i);
  }

  toks.push({ kind: "eof", pos: n });
  return toks;
}

class Parser {
  private p = 0;
  private readonly toks: Tok[];

  constructor(toks: Tok[]) {
    this.toks = toks;
  }

  private peek(): Tok { return this.toks[this.p]!; }

  private next(): Tok { return this.toks[this.p++]!; }

  private expect(kind: TokKind): Tok {
    const t = this.next();
    if (t.kind !== kind) throw new LuaParseError(`expected ${kind}, got ${t.kind}`, t.pos);
    return t;
  }

  /** Top level: a run of `NAME = value` assignments. */
  parseChunk(): Record<string, LuaValue> {
    const out: Record<string, LuaValue> = {};
    while (this.peek().kind !== "eof") {
      if (this.peek().kind === ";") { this.next(); continue; }
      const name = this.expect("name");
      this.expect("=");
      out[String(name.value)] = this.parseValue(0);
    }
    return out;
  }

  private parseValue(depth: number): LuaValue {
    if (depth > MAX_DEPTH) throw new LuaParseError("nesting too deep", this.peek().pos);
    const t = this.next();
    switch (t.kind) {
      case "string": return String(t.value);
      case "number": return Number(t.value);
      case "true": return true;
      case "false": return false;
      case "nil": return null;
      case "{": return this.parseTable(depth + 1);
      default: throw new LuaParseError(`unexpected ${t.kind}`, t.pos);
    }
  }

  private parseTable(depth: number): LuaValue {
    const array: LuaValue[] = [];
    const hash: Record<string, LuaValue> = {};
    let hasHash = false;

    while (true) {
      const t = this.peek();
      if (t.kind === "}") { this.next(); break; }
      if (t.kind === "," || t.kind === ";") { this.next(); continue; }
      if (t.kind === "eof") throw new LuaParseError("unterminated table", t.pos);

      if (t.kind === "[") {
        this.next();
        const keyTok = this.next();
        if (keyTok.kind !== "string" && keyTok.kind !== "number") {
          throw new LuaParseError(`unsupported table key ${keyTok.kind}`, keyTok.pos);
        }
        this.expect("]");
        this.expect("=");
        hash[String(keyTok.value)] = this.parseValue(depth);
        hasHash = true;
        continue;
      }

      if (t.kind === "name" && this.toks[this.p + 1]?.kind === "=") {
        this.next();
        this.next();
        hash[String(t.value)] = this.parseValue(depth);
        hasHash = true;
        continue;
      }

      array.push(this.parseValue(depth));
    }

    if (!hasHash) return array;
    for (let k = 0; k < array.length; k++) hash[String(k + 1)] = array[k]!;
    return hash;
  }
}

/** Parse a SavedVariables file into its top-level globals. */
export function parseSavedVariables(source: string): Record<string, LuaValue> {
  if (source.length > MAX_BYTES) {
    throw new LuaParseError(`file too large (${source.length} bytes)`, 0);
  }
  return new Parser(tokenize(source)).parseChunk();
}

/**
 * Pull the incidents array out of a parsed GoopKOS SavedVariables file.
 * Returns [] rather than throwing when the shape is not what we expect —
 * a half-written file during a logout flush is normal, not an error.
 */
export function readIncidents(
  globals: Record<string, LuaValue>,
  varName = "GoopKOSDB",
): Record<string, LuaValue>[] {
  const db = globals[varName];
  if (typeof db !== "object" || db === null || Array.isArray(db)) return [];
  const incidents = (db as Record<string, LuaValue>).incidents;
  if (!Array.isArray(incidents)) return [];
  return incidents.filter(
    (e): e is Record<string, LuaValue> =>
      typeof e === "object" && e !== null && !Array.isArray(e),
  );
}
