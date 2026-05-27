#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_PACKAGE_DIR = path.join(ROOT, "dist", "vault-runtime");
const EXPECTED_PACKAGE_NAME = "@flapsdk/vault-runtime";
const EXPECTED_EXPORTS = ["./sdk", "./ui", "./host", "./server", "./runtime-contract", "./package.json"];
const EXPECTED_FILES = ["sdk.js", "sdk.d.mts", "host.js", "host.d.mts", "server.js", "server.d.mts", "ui.js", "ui.d.mts", "package.json", "runtime-contract.json", "README.md"];

async function ensureFile(filePath) {
  await access(filePath);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readText(filePath) {
  return readFile(filePath, "utf8");
}

async function main() {
  const packageDir = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : DEFAULT_PACKAGE_DIR;

  for (const file of EXPECTED_FILES) {
    await ensureFile(path.join(packageDir, file));
  }

  const [manifest, runtimeContract, sdkSource, uiSource] = await Promise.all([
    readJson(path.join(packageDir, "package.json")),
    readJson(path.join(packageDir, "runtime-contract.json")),
    readText(path.join(packageDir, "sdk.js")),
    readText(path.join(packageDir, "ui.js")),
  ]);

  for (const key of EXPECTED_EXPORTS) {
    if (!(key in manifest.exports)) {
      throw new Error(`Missing package export ${key}.`);
    }
  }

  if (manifest.name !== EXPECTED_PACKAGE_NAME) {
    throw new Error(`Expected package name ${EXPECTED_PACKAGE_NAME}, received ${manifest.name}.`);
  }

  if (runtimeContract.packageName !== EXPECTED_PACKAGE_NAME) {
    throw new Error(`Expected runtime contract package name ${EXPECTED_PACKAGE_NAME}, received ${runtimeContract.packageName}.`);
  }

  if (runtimeContract.runtimeContractVersion !== 1) {
    throw new Error(`Expected runtimeContractVersion 1, received ${runtimeContract.runtimeContractVersion}.`);
  }

  if (!sdkSource.startsWith('"use client";')) {
    throw new Error("sdk.js must keep the use client directive.");
  }

  if (!uiSource.startsWith('"use client";')) {
    throw new Error("ui.js must keep the use client directive.");
  }

  const packPreview = JSON.parse(
    execFileSync("npm", ["pack", "--json", "--dry-run"], {
      cwd: packageDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );

  for (const previewEntry of packPreview) {
    if (previewEntry?.name !== EXPECTED_PACKAGE_NAME) {
      throw new Error(`npm pack preview returned unexpected package name ${previewEntry?.name}.`);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        packageDir: path.relative(ROOT, packageDir),
        packageAbsolutePath: packageDir,
        packageName: manifest.name,
        runtimeContractVersion: runtimeContract.runtimeContractVersion,
        exports: EXPECTED_EXPORTS,
        packPreview,
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
        code: "runtime-package/verify-failed",
        error: error instanceof Error ? error.message : String(error),
        fixHint: "Build the runtime package first, then verify the generated exports, metadata, and npm pack preview.",
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
