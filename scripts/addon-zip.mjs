// Builds apps/web/public/GoopKOS.zip from addon/GoopKOS and records the
// addon version for the download panel, so the two can't drift apart.
// Writes the zip itself rather than shelling out to tar: `tar -a` only makes
// a zip with Windows' bsdtar, and quietly makes a plain tar from Git Bash.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { zipSync } from "fflate";

const toc = readFileSync("addon/GoopKOS/GoopKOS.toc", "utf8");
const version = toc.match(/^## Version:\s*(\S+)/m)?.[1];
if (!version) throw new Error("no ## Version in GoopKOS.toc");

writeFileSync(
  "apps/web/src/lib/addonVersion.ts",
  `// Written by \`pnpm addon:zip\` from GoopKOS.toc. Don't edit by hand.\nexport const ADDON_VERSION = ${JSON.stringify(version)};\n`,
);

/** Every file under dir, as "GoopKOS/relative/path" -> bytes. */
function collect(dir, prefix, out) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, `${prefix}${name}/`, out);
    else out[`${prefix}${name}`] = readFileSync(full);
  }
  return out;
}

const files = collect("addon/GoopKOS", "GoopKOS/", {});
writeFileSync("apps/web/public/GoopKOS.zip", zipSync(files, { level: 9 }));
console.log(`GoopKOS.zip built for v${version} (${Object.keys(files).length} files)`);
