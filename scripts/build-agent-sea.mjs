import { build } from "esbuild";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const platformName = process.platform === "win32" ? "win" : process.platform === "linux" ? "linux" : null;
if (!platformName) throw new Error(`SEA packaging is not supported on ${process.platform}.`);

const outputDirectory = path.join(root, "release", "agent", platformName);
const workDirectory = path.join(root, "release", ".sea-work");
await rm(workDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await mkdir(workDirectory, { recursive: true });

await buildExecutable("packages/agent/src/service.ts", executableName("lab-fleet-agent"));
await buildExecutable("packages/agent/src/ctl.ts", executableName("lab-fleetctl"));

async function buildExecutable(entry, outputName) {
  const stem = path.parse(outputName).name;
  const bundle = path.join(workDirectory, `${stem}.cjs`);
  const blob = path.join(workDirectory, `${stem}.blob`);
  const config = path.join(workDirectory, `${stem}.json`);
  const output = path.join(outputDirectory, outputName);

  await build({
    entryPoints: [path.join(root, entry)],
    outfile: bundle,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    minify: true,
    sourcemap: false
  });
  await writeFile(config, JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false }));
  run(process.execPath, ["--experimental-sea-config", config]);
  await copyFile(process.execPath, output);
  const postject = path.join(root, "node_modules", "postject", "dist", "cli.js");
  run(process.execPath, [
    postject,
    output,
    "NODE_SEA_BLOB",
    blob,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
  ]);
  process.stdout.write(`Built ${path.relative(root, output)}\n`);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${path.basename(command)} exited with status ${result.status}.`);
}

function executableName(name) {
  return process.platform === "win32" ? `${name}.exe` : name;
}
