import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Mode = "background" | "once";

export interface Config {
  /** The WoW folder the person picked or we found. */
  wowDir?: string;
  mode?: Mode;
  autostart?: boolean;
}

/** Where the program keeps its own settings and sync state. */
export function configDir(): string {
  let base: string;
  if (process.platform === "win32") {
    base = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  } else if (process.platform === "darwin") {
    base = join(homedir(), "Library", "Application Support");
  } else {
    base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  }
  const dir = join(base, "GoopKOS");
  mkdirSync(dir, { recursive: true });
  return dir;
}

const file = () => join(configDir(), "config.json");
export const statePath = () => join(configDir(), "state.json");

export function loadConfig(): Config {
  if (!existsSync(file())) return {};
  try {
    const raw = JSON.parse(readFileSync(file(), "utf8"));
    const cfg: Config = {};
    if (typeof raw?.wowDir === "string") cfg.wowDir = raw.wowDir;
    if (raw?.mode === "background" || raw?.mode === "once") cfg.mode = raw.mode;
    if (typeof raw?.autostart === "boolean") cfg.autostart = raw.autostart;
    return cfg;
  } catch {
    return {};
  }
}

export function saveConfig(cfg: Config): void {
  writeFileSync(file(), JSON.stringify(cfg, null, 2), "utf8");
}
