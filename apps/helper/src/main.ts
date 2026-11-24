import { createInterface } from "node:readline/promises";
import { loadConfig, saveConfig, type Config, type Mode } from "./config.ts";
import { setAutostart } from "./autostart.ts";
import { fetchRemoteConfig, installAddon, installedVersion, type RemoteConfig } from "./install.ts";
import { asInstall, findInstalls, type Install } from "./locate.ts";
import { Syncer } from "./sync.ts";

const SITE = (process.env.GOOPKOS_SITE || "https://goop-kos.vercel.app").replace(/\/+$/, "");
const args = new Set(process.argv.slice(2));
const BACKGROUND = args.has("--background"); // set by the start-with-computer entry: never ask anything
const SETTINGS = args.has("--settings");

// Read answers as a stream of lines, so typed input and piped input both work.
const lines = BACKGROUND ? null : createInterface({ input: process.stdin })[Symbol.asyncIterator]();
const say = (line = "") => console.log(line);
const stamp = (line: string) => console.log(`[${new Date().toLocaleTimeString()}] ${line}`);

/** One typed line, or "" if there's no one to answer (closed input, background). */
async function ask(question: string): Promise<string> {
  if (!lines) return "";
  process.stdout.write(question);
  const next = await lines.next();
  return next.done ? "" : String(next.value).trim();
}

async function pickInstall(cfg: Config): Promise<Install | null> {
  if (cfg.wowDir) {
    const saved = asInstall(cfg.wowDir);
    if (saved) return saved;
    say(`The saved WoW folder is gone: ${cfg.wowDir}`);
  }
  if (BACKGROUND) return null;

  say("Looking for WoW Forever...");
  const found = findInstalls();
  if (found.length === 1) {
    say(`Found it: ${found[0]!.gameDir}`);
    return found[0]!;
  }
  if (found.length > 1) {
    say("Found more than one:");
    found.forEach((f, i) => say(`  ${i + 1}) ${f.gameDir}`));
    const n = Number(await ask("Which one? (number) "));
    if (found[n - 1]) return found[n - 1]!;
  }

  say("Couldn't find it on its own. Paste the folder where WoW Forever lives.");
  say("(The one that contains _forever_. Example: C:\\Program Files (x86)\\World of Warcraft)");
  for (let tries = 0; tries < 5; tries++) {
    const typed = await ask("Folder: ");
    if (!typed) continue;
    const inst = asInstall(typed);
    if (inst) return inst;
    say("That folder doesn't have Interface\\AddOns inside it (or a _forever_ folder with it). Try the folder one level up or down.");
  }
  return null;
}

async function chooseMode(cfg: Config): Promise<void> {
  say();
  say("How should GoopKOS run?");
  say("  1) In the background. It starts with your computer and keeps your list in sync as you play.");
  say("  2) Only when I open it. It updates, syncs once and closes. Nothing runs while you play.");
  const answer = await ask("Pick 1 or 2 [1]: ");
  const mode: Mode = answer === "2" ? "once" : "background";
  cfg.mode = mode;

  if (mode === "background") {
    const yes = (await ask("Start it automatically when you turn on your computer? (Y/n) ")).toLowerCase();
    cfg.autostart = yes !== "n" && yes !== "no";
  } else {
    cfg.autostart = false;
  }
  const worked = setAutostart(cfg.autostart);
  if (cfg.autostart && !worked) say("(Couldn't set up starting with your computer from here. You can open it by hand instead.)");
  saveConfig(cfg);
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  say("GoopKOS");
  say("-------");

  const install = await pickInstall(cfg);
  if (!install) {
    say("No WoW folder, so nothing to do. Run this again once you know where it is.");
    if (!BACKGROUND) await ask("Press Enter to close. ");
    process.exit(1);
  }
  cfg.wowDir = install.gameDir;
  saveConfig(cfg);

  let remote: RemoteConfig | null = null;
  try {
    remote = await fetchRemoteConfig(SITE);
  } catch (err) {
    stamp(`can't reach the GoopKOS site (${err instanceof Error ? err.message : err}). No updates or syncing until it's back.`);
  }

  if (remote) {
    try {
      const result = await installAddon(SITE, remote, install.addons);
      const v = installedVersion(install.addons);
      if (result === "installed") stamp(`addon installed (v${v}). Start WoW and tick GoopKOS under AddOns at character select.`);
      else if (result === "updated") stamp(`addon updated to v${v}. Type /reload in game, or restart it, to use the new version.`);
      else stamp(`addon is up to date (v${v}).`);
    } catch (err) {
      stamp(`couldn't install the addon: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (!cfg.mode || SETTINGS) {
    if (BACKGROUND) cfg.mode = "background";
    else await chooseMode(cfg);
  }

  if (!remote) {
    if (!BACKGROUND) await ask("Press Enter to close. ");
    process.exit(remote ? 0 : 1);
  }

  const syncer = new Syncer(SITE, remote.apiKey, install, stamp);

  if (cfg.mode === "once") {
    await syncer.once();
    say();
    say("All synced. You can close this.");
    if (!BACKGROUND) await ask("Press Enter to close. ");
    process.exit(0);
  }

  await syncer.once();
  syncer.startWatching();
  say();
  say("Running in the background. Close this window to stop it.");
  say("(Run it again with --settings to change how it works.)");
}

main().catch((err) => {
  console.error("GoopKOS hit a problem:", err instanceof Error ? err.message : err);
  process.exit(1);
});
