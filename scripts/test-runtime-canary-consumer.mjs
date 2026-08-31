#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, cp, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const PACKAGE_NAME = "@flapsdk/vault-runtime";
const SCRIPT_PATTERN = /^[A-Za-z0-9:_-]+$/;
const BACKUP_PREFIX = "vault-runtime.flap-canary-backup-";

function yarnCommand() {
  return process.platform === "win32" ? "yarn.cmd" : "yarn";
}

function parseArgs(args) {
  const result = { tarball: "", consumer: "", scripts: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--consumer") result.consumer = args[++index] ?? "";
    else if (arg === "--script") result.scripts.push(args[++index] ?? "");
    else if (!result.tarball && !arg.startsWith("--")) result.tarball = arg;
    else throw new Error(`Unknown canary consumer option ${arg}.`);
  }
  if (!result.tarball) throw new Error("Pass the canary .tgz path as the first argument.");
  if (!result.consumer) throw new Error("Pass --consumer /absolute/path/to/project.");
  if (!result.scripts.length) throw new Error("Pass at least one --script <package-script>.");
  if (result.scripts.some((script) => !SCRIPT_PATTERN.test(script))) {
    throw new Error("Consumer script names may contain only letters, numbers, colon, underscore, and hyphen.");
  }
  return result;
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function main() {
  const input = parseArgs(process.argv.slice(2));
  const tarballPath = path.resolve(process.cwd(), input.tarball);
  const consumerRoot = path.resolve(input.consumer);
  if (!tarballPath.endsWith(".tgz")) throw new Error("The canary package must be an npm .tgz tarball.");
  await access(tarballPath);

  const packageJsonPath = path.join(consumerRoot, "package.json");
  const consumerManifest = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const declaredRuntime = consumerManifest.dependencies?.[PACKAGE_NAME] ?? consumerManifest.devDependencies?.[PACKAGE_NAME];
  if (!declaredRuntime) throw new Error(`${consumerRoot} does not declare ${PACKAGE_NAME}.`);
  for (const script of input.scripts) {
    if (!consumerManifest.scripts?.[script]) throw new Error(`${consumerRoot} does not define yarn script ${script}.`);
  }

  const nodeModulesDir = path.join(consumerRoot, "node_modules");
  const scopeDir = path.join(nodeModulesDir, "@flapsdk");
  const runtimeDir = path.join(scopeDir, "vault-runtime");
  await access(runtimeDir);
  const staleBackups = (await readdir(scopeDir)).filter((name) => name.startsWith(BACKUP_PREFIX));
  if (staleBackups.length) {
    throw new Error(`Found an unfinished canary backup under ${scopeDir}: ${staleBackups.join(", ")}. Restore it before retrying.`);
  }

  const backupDir = path.join(scopeDir, `${BACKUP_PREFIX}${process.pid}-${Date.now()}`);
  const stagingRoot = await mkdtemp(path.join(os.tmpdir(), "flap-runtime-canary-"));
  const tarball = await readFile(tarballPath);
  const sha256 = createHash("sha256").update(tarball).digest("hex");
  let backedUp = false;
  let result;

  try {
    await writeFile(path.join(stagingRoot, "package.json"), '{"name":"flap-runtime-canary-install","private":true}\n');
    execFileSync(
      npmCommand(),
      ["install", "--ignore-scripts", "--no-package-lock", "--no-save", "--legacy-peer-deps", tarballPath],
      { cwd: stagingRoot, stdio: "inherit" },
    );

    const stagedRuntimeDir = path.join(stagingRoot, "node_modules", "@flapsdk", "vault-runtime");
    const installedManifest = JSON.parse(await readFile(path.join(stagedRuntimeDir, "package.json"), "utf8"));
    if (installedManifest.name !== PACKAGE_NAME || installedManifest.private !== true || installedManifest.flapCanary?.publishable !== false) {
      throw new Error("The installed tarball is not a protected @flapsdk/vault-runtime canary package.");
    }

    await rename(runtimeDir, backupDir);
    backedUp = true;
    await cp(stagedRuntimeDir, runtimeDir, { recursive: true });

    for (const script of input.scripts) {
      execFileSync(yarnCommand(), [script], { cwd: consumerRoot, stdio: "inherit" });
    }

    result = {
      ok: true,
      packageName: installedManifest.name,
      packageVersion: installedManifest.version,
      gitHead: installedManifest.gitHead,
      tarballAbsolutePath: tarballPath,
      sha256,
      consumer: consumerRoot,
      scripts: input.scripts,
      consumerDependencyFilesUntouched: true,
      installedRuntimeRestored: true,
    };
  } finally {
    if (backedUp) {
      await rm(runtimeDir, { recursive: true, force: true });
      await rename(backupDir, runtimeDir);
    }
    await rm(stagingRoot, { recursive: true, force: true });
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: "runtime-package/canary-consumer-failed",
        error: error instanceof Error ? error.message : String(error),
        fixHint: "Fix the reported consumer or canary package failure. The script leaves dependency files untouched and restores the previously installed runtime package before exiting.",
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
