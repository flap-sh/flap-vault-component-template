#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_DIR = path.join(ROOT, "dist", "vault-runtime");
const PACK_DIR = path.join(ROOT, "dist", "npm");

function runNode(script, args = []) {
  execFileSync(process.execPath, [path.join(ROOT, script), ...args], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

async function main() {
  if (process.argv.length > 2) throw new Error("runtime:pack:canary does not accept arguments.");

  runNode("scripts/build-runtime-package.mjs", ["--canary"]);
  runNode("scripts/verify-runtime-package.mjs", ["dist/vault-runtime", "--canary"]);

  await mkdir(PACK_DIR, { recursive: true });
  const packResult = JSON.parse(
    execFileSync("npm", ["pack", PACKAGE_DIR, "--json", "--pack-destination", PACK_DIR], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  if (!Array.isArray(packResult) || packResult.length !== 1 || !packResult[0]?.filename) {
    throw new Error(`npm pack returned an unexpected result: ${JSON.stringify(packResult)}.`);
  }

  const tarballPath = path.join(PACK_DIR, path.basename(packResult[0].filename));
  const tarball = await readFile(tarballPath);
  const sha256 = createHash("sha256").update(tarball).digest("hex");
  const manifest = JSON.parse(await readFile(path.join(PACKAGE_DIR, "package.json"), "utf8"));

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "canary",
        packageName: manifest.name,
        packageVersion: manifest.version,
        gitHead: manifest.gitHead,
        publishable: false,
        tarballPath: path.relative(ROOT, tarballPath),
        tarballAbsolutePath: tarballPath,
        sha256,
        bytes: tarball.byteLength,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: "runtime-package/canary-pack-failed",
        error: error instanceof Error ? error.message : String(error),
        fixHint: "Fix the canary build or verifier failure, keep the worktree clean and committed, then rerun yarn runtime:pack:canary.",
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
