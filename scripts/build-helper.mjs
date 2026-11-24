// Builds the GoopKOS helper into one self-contained program for THIS computer's
// OS: bundle the TypeScript with esbuild, then bake it into a copy of the Node
// binary (Node's single-executable feature). Run it on Windows for the .exe and
// on a Mac for the Mac program; a program can't be built for the other OS.
//
//   pnpm helper:build        -> dist/helper/goopkos-helper-<os>-<arch>[.exe]
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";

const platform = process.platform; // win32 | darwin | linux
const os = platform === "win32" ? "win" : platform === "darwin" ? "mac" : "linux";
const name = `goopkos-helper-${os}-${process.arch}${platform === "win32" ? ".exe" : ""}`;

const work = "dist/helper-build";
const out = "dist/helper";
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
mkdirSync(out, { recursive: true });

// 1. One CommonJS file with everything inside (SEA runs a single script).
await build({
  entryPoints: ["apps/helper/src/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  outfile: join(work, "helper.cjs"),
  logLevel: "warning",
});

// 2. The blob Node injects.
writeFileSync(
  join(work, "sea-config.json"),
  JSON.stringify({
    main: join(work, "helper.cjs"),
    output: join(work, "helper.blob"),
    disableExperimentalSEAWarning: true,
  }),
);
execFileSync(process.execPath, ["--experimental-sea-config", join(work, "sea-config.json")], { stdio: "inherit" });

// 3. A copy of this Node, with the blob injected.
const exe = join(out, name);
copyFileSync(process.execPath, exe);
if (platform !== "win32") chmodSync(exe, 0o755);
if (platform === "darwin") execFileSync("codesign", ["--remove-signature", exe], { stdio: "inherit" });

const postject = join("node_modules", "postject", "dist", "cli.js");
const args = [
  postject, exe, "NODE_SEA_BLOB", join(work, "helper.blob"),
  "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
];
if (platform === "darwin") args.push("--macho-segment-name", "NODE_SEA");
execFileSync(process.execPath, args, { stdio: "inherit" });

// macOS refuses to run a modified binary until it is (ad hoc) signed again.
if (platform === "darwin") execFileSync("codesign", ["--sign", "-", exe], { stdio: "inherit" });

console.log(`built ${exe}`);
