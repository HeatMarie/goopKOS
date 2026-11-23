// Builds apps/web/public/GoopKOS.zip from addon/GoopKOS and records the
// addon version for the download panel, so the two can't drift apart.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const toc = readFileSync("addon/GoopKOS/GoopKOS.toc", "utf8");
const version = toc.match(/^## Version:\s*(\S+)/m)?.[1];
if (!version) throw new Error("no ## Version in GoopKOS.toc");

writeFileSync(
  "apps/web/src/lib/addonVersion.ts",
  `// Written by \`pnpm addon:zip\` from GoopKOS.toc. Don't edit by hand.\nexport const ADDON_VERSION = ${JSON.stringify(version)};\n`,
);
execFileSync("tar", ["-a", "-cf", "../apps/web/public/GoopKOS.zip", "GoopKOS"], { cwd: "addon", stdio: "inherit" });
console.log(`GoopKOS.zip built for v${version}`);
