import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const NAME = "GoopKOS Helper";
const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const PLIST = join(homedir(), "Library", "LaunchAgents", "com.goopkos.helper.plist");

/** True when this is the packaged program, not `node main.ts` during development. */
export function isPackaged(): boolean {
  return !/^node(\.exe)?$/i.test(basename(process.execPath));
}

/**
 * Start the program (in background mode) when the person signs in, or stop
 * doing so. Returns false if it can't be done, e.g. when run from source.
 */
export function setAutostart(on: boolean): boolean {
  if (!isPackaged()) return false;
  const exe = process.execPath;
  try {
    if (process.platform === "win32") {
      if (on) {
        execFileSync("reg", ["add", RUN_KEY, "/v", NAME, "/t", "REG_SZ", "/d", `"${exe}" --background`, "/f"], { windowsHide: true, stdio: "ignore" });
      } else {
        try {
          execFileSync("reg", ["delete", RUN_KEY, "/v", NAME, "/f"], { windowsHide: true, stdio: "ignore" });
        } catch {
          /* nothing to remove: already off */
        }
      }
      return true;
    }
    if (process.platform === "darwin") {
      if (on) {
        mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
        writeFileSync(
          PLIST,
          `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.goopkos.helper</string>
<key>ProgramArguments</key><array><string>${exe}</string><string>--background</string></array>
<key>RunAtLoad</key><true/>
</dict></plist>
`,
          "utf8",
        );
      } else if (existsSync(PLIST)) {
        rmSync(PLIST);
      }
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
}
