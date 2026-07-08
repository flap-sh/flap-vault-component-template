#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import archiver from "archiver";
import { assertTemplateFresh } from "./check-template-fresh.mjs";
import {
  E2E_REPORT_KIND,
  E2E_REPORT_PACKAGE_PATH,
  E2E_REPORT_TOOL,
  E2E_REPORT_VERSION,
  REQUIRED_PHASES,
  REQUIRED_VIEWPORTS,
  sourceSha256FromFileHashes,
  summarizeE2EReportForMarker,
} from "./e2e-report-utils.mjs";

const ROOT = process.cwd();
const VERIFY_SCRIPT = path.join(ROOT, "scripts", "vault-verify-package.mjs");
const OUT_DIR = path.join(ROOT, "dist", `vault-verify-package-selftest-${process.pid}-${Date.now()}`);
const FOLDER_NAME = "verify-package-selftest";
const ARTIFACT_ID = `vaultui_${FOLDER_NAME}_01K9V9Z0P0AAAAAAAAAAAAAAAA`;
const FACTORY = "0xc3e4ee8f3c616d16297fafcb9daab122d31efa9e";
const TOKEN = "0x286184b2660a2822671a33f24c4517f593947777";

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function jsonBuffer(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseFailure(stderr) {
  const start = stderr.indexOf("{");
  const end = stderr.lastIndexOf("}");
  assert.ok(start >= 0 && end > start, `Expected JSON failure output, got:\n${stderr}`);
  return JSON.parse(stderr.slice(start, end + 1));
}

function runVerifier(args) {
  return spawnSync(process.execPath, [VERIFY_SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

async function writeZip(zipPath, entries) {
  await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);
    for (const [name, content] of Object.entries(entries)) {
      archive.append(content, { name });
    }
    archive.finalize();
  });
}

async function writePackage(name, { templateVersion, runtimePackageVersion, runtimePackageGitHead, schemaBuffer }) {
  const sourceBase = `src/vaults/${FOLDER_NAME}`;
  const component = Buffer.from('export default function SelftestVault() { return <div>Selftest</div>; }\n', "utf8");
  const manifest = jsonBuffer({
    artifactId: ARTIFACT_ID,
    name: "Verifier Selftest",
    match: {
      bindings: [{ chainId: 56, factoryAddress: FACTORY, tokenAddresses: [TOKEN] }],
    },
    i18n: ["en"],
  });
  const abi = Buffer.from("export const vaultAbi = [] as const;\n", "utf8");
  const i18n = jsonBuffer({ en: { title: "Selftest" } });
  const fileSha256 = {
    [`${sourceBase}/Component.tsx`]: sha256(component),
    [`${sourceBase}/manifest.json`]: sha256(manifest),
    [`${sourceBase}/VaultABI.ts`]: sha256(abi),
    [`${sourceBase}/i18n.json`]: sha256(i18n),
    "schemas/manifest.schema.json": sha256(schemaBuffer),
  };
  const e2eReport = {
    kind: E2E_REPORT_KIND,
    schemaVersion: E2E_REPORT_VERSION,
    generatedBy: E2E_REPORT_TOOL,
    generatedAt: new Date().toISOString(),
    folderName: FOLDER_NAME,
    artifactId: ARTIFACT_ID,
    sourcePackage: sourceBase,
    sourceSha256: sourceSha256FromFileHashes(fileSha256),
    fileSha256,
    manifestSha256: fileSha256[`${sourceBase}/manifest.json`],
    schemaSha256: fileSha256["schemas/manifest.schema.json"],
    binding: {
      chainId: 56,
      tokenAddress: TOKEN,
      factoryAddress: FACTORY,
      tokenPolicy: "mainnet-fallback",
    },
    viewports: [
      { id: "pc", width: 1440, height: 900 },
      { id: "ipad", width: 834, height: 1194 },
      { id: "h5", width: 390, height: 844 },
    ],
    phases: REQUIRED_PHASES,
    passed: true,
    summary: { blocking: 0, warning: 0, info: REQUIRED_VIEWPORTS.length * REQUIRED_PHASES.length },
    layoutCheckSummary: {
      horizontalOverflow: 0,
      scopeOutOfViewport: 0,
      textOverflow: 0,
      controlCovered: 0,
      controlOverlap: 0,
      riskStatus: 0,
      wrongNetworkState: 0,
      renderErrors: 0,
    },
  };
  const e2eRaw = jsonBuffer(e2eReport);
  const marker = {
    kind: "flap-vault-ui-source-package",
    formatVersion: 5,
    generatedBy: "yarn vault:package",
    generator: "flap-vault-ui-template",
    templateName: "flap-vault-ui-template",
    templateVersion,
    runtimePackageName: "@flapsdk/vault-runtime",
    runtimePackageVersion,
    runtimePackageGitHead,
    runtimeContractVersion: 1,
    artifactId: ARTIFACT_ID,
    folderName: FOLDER_NAME,
    sourcePackage: sourceBase,
    packagedAt: new Date().toISOString(),
    check: { passed: true, summary: { blocking: 0, warning: 0, info: 0 } },
    e2e: summarizeE2EReportForMarker(e2eReport),
    requiredSourceFiles: ["Component.tsx", "manifest.json", "VaultABI.ts", "i18n.json"].map((file) => `${sourceBase}/${file}`),
    fileSha256: {
      ...fileSha256,
      [E2E_REPORT_PACKAGE_PATH]: sha256(e2eRaw),
    },
  };
  const metadata = {
    packageKind: marker.kind,
    packageFormatVersion: marker.formatVersion,
    packageMarkerFile: "flap-vault-package.json",
    generatedBy: marker.generatedBy,
    generator: marker.generator,
    templateName: marker.templateName,
    templateVersion,
    runtimePackageName: marker.runtimePackageName,
    runtimePackageVersion,
    runtimePackageGitHead,
    runtimeContractVersion: marker.runtimeContractVersion,
    artifactId: ARTIFACT_ID,
    folderName: FOLDER_NAME,
    name: "Verifier Selftest",
    bindingKeys: [`56:${FACTORY}`],
    packagedAt: marker.packagedAt,
    manifestSha256: fileSha256[`${sourceBase}/manifest.json`],
    sourcePackage: sourceBase,
    checkSummary: marker.check.summary,
    e2e: marker.e2e,
  };
  const zipPath = path.join(OUT_DIR, `${name}.zip`);
  await writeZip(zipPath, {
    "flap-vault-package.json": jsonBuffer(marker),
    "package-metadata.json": jsonBuffer(metadata),
    [E2E_REPORT_PACKAGE_PATH]: e2eRaw,
    "schemas/manifest.schema.json": schemaBuffer,
    [`${sourceBase}/Component.tsx`]: component,
    [`${sourceBase}/manifest.json`]: manifest,
    [`${sourceBase}/VaultABI.ts`]: abi,
    [`${sourceBase}/i18n.json`]: i18n,
  });
  return zipPath;
}

try {
  const rootPackage = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const freshness = await assertTemplateFresh({ folderName: FOLDER_NAME });
  const currentVersion = rootPackage.version;
  const currentGitHead = freshness.checks?.npm?.latestGitHead;
  assert.ok(currentGitHead, "npm latest gitHead is required for verifier selftest");
  const currentSchema = fs.readFileSync(path.join(ROOT, "schemas", "manifest.schema.json"));

  const currentZip = await writePackage("current", {
    templateVersion: currentVersion,
    runtimePackageVersion: currentVersion,
    runtimePackageGitHead: currentGitHead,
    schemaBuffer: currentSchema,
  });
  const currentResult = runVerifier([currentZip]);
  assert.equal(currentResult.status, 0, currentResult.stderr || currentResult.stdout);

  const oldVersionZip = await writePackage("old-version", {
    templateVersion: "0.1.11",
    runtimePackageVersion: "0.1.11",
    runtimePackageGitHead: currentGitHead,
    schemaBuffer: currentSchema,
  });
  const oldVersionResult = runVerifier([oldVersionZip]);
  assert.notEqual(oldVersionResult.status, 0);
  assert.equal(parseFailure(oldVersionResult.stderr).code, "package-verify/template-version-not-current");
  assert.equal(runVerifier([oldVersionZip, "--self-contained"]).status, 0);

  const staleSchemaZip = await writePackage("stale-schema", {
    templateVersion: currentVersion,
    runtimePackageVersion: currentVersion,
    runtimePackageGitHead: currentGitHead,
    schemaBuffer: Buffer.concat([currentSchema, Buffer.from("\n")]),
  });
  const staleSchemaResult = runVerifier([staleSchemaZip]);
  assert.notEqual(staleSchemaResult.status, 0);
  assert.equal(parseFailure(staleSchemaResult.stderr).code, "package-verify/schema-not-current");
  assert.equal(runVerifier([staleSchemaZip, "--self-contained"]).status, 0);

  console.log(JSON.stringify({ ok: true, message: "vault:verify-package selftest passed" }, null, 2));
} finally {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
}
