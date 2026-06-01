#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import archiver from "archiver";
import { failAgent } from "./agent-error.mjs";
import { assertTemplateFresh } from "./check-template-fresh.mjs";
import { runVaultCheck } from "./vault-check.mjs";

const ROOT = process.cwd();
const PACKAGE_KIND = "flap-vault-ui-source-package";
const PACKAGE_FORMAT_VERSION = 3;
const PACKAGE_TOOL = "yarn vault:package";
const PACKAGE_MARKER_FILE = "flap-vault-package.json";
const TEMPLATE_NAME = "flap-vault-ui-template";
const RUNTIME_PACKAGE_NAME = "@flapsdk/vault-runtime";
const RUNTIME_CONTRACT_VERSION = 1;
const REQUIRED_SOURCE_FILES = ["Component.tsx", "manifest.json", "VaultABI.ts", "i18n.json"];
const folderName = process.argv[2];
const rootPackage = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const templateVersion = rootPackage.version;
const runtimePackageVersion = rootPackage.version;
const freshness = await assertTemplateFresh({ folderName });
const runtimePackageGitHead = freshness.checks?.npm?.latestGitHead;
if (!runtimePackageGitHead) {
  failAgent({
    code: "package/runtime-git-head-missing",
    message: `Cannot package ${folderName || "<folder-name>"}: npm latest ${RUNTIME_PACKAGE_NAME} did not expose gitHead provenance.`,
    fixHint: "Publish the runtime package from git so npm exposes gitHead, then rerun yarn vault:package <folder-name>.",
    extra: {
      folderName,
      runtimePackageName: RUNTIME_PACKAGE_NAME,
      runtimePackageVersion,
    },
  });
}
const result = runVaultCheck(folderName, { silent: true });
const hasBlocking = result.issues.some((item) => item.severity === "blocking");
if (hasBlocking) {
  failAgent({
    code: "package/check-blocking",
    message: `Cannot package ${folderName || "<folder-name>"}: vault:check reported blocking issues.`,
    fixHint: "Fix agent.nextActions from vault:check, rerun yarn vault:check <folder-name>, then rerun yarn vault:package <folder-name>.",
    nextActions: result.agent?.nextActions,
    extra: {
      folderName,
      check: {
        ok: result.ok,
        summary: result.summary,
        verdict: result.agent?.verdict,
      },
      issues: result.issues,
    },
  });
}

const vaultDir = path.join(ROOT, "src", "vaults", folderName);
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDir, "manifest.json"), "utf8"));
const outDir = path.join(ROOT, "dist");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${folderName}.zip`);

if (fs.existsSync(outFile)) {
  fs.unlinkSync(outFile);
}

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function summarizeCheck(issues) {
  return {
    blocking: issues.filter((item) => item.severity === "blocking").length,
    warning: issues.filter((item) => item.severity === "warning").length,
    info: issues.filter((item) => item.severity === "info").length,
  };
}

const output = fs.createWriteStream(outFile);
const archive = archiver("zip", { zlib: { level: 9 } });

archive.pipe(output);
archive.directory(vaultDir, `src/vaults/${folderName}`, (entry) => {
  const blocked = [".env", ".env.local", "node_modules", ".git", ".vercel", "package-lock.json", "pnpm-lock.yaml"];
  if (blocked.some((part) => entry.name.includes(part))) return false;
  return entry;
});
archive.file(path.join(ROOT, "schemas", "manifest.schema.json"), { name: "schemas/manifest.schema.json" });

const packagedAt = new Date().toISOString();
const sourceFileHashes = Object.fromEntries(
  REQUIRED_SOURCE_FILES.map((file) => {
    const packagePath = `src/vaults/${folderName}/${file}`;
    return [packagePath, hashFile(path.join(vaultDir, file))];
  }),
);
const schemaPath = "schemas/manifest.schema.json";
const schemaSha256 = hashFile(path.join(ROOT, schemaPath));
const checkSummary = summarizeCheck(result.issues);
const packageMarker = {
  kind: PACKAGE_KIND,
  formatVersion: PACKAGE_FORMAT_VERSION,
  generatedBy: PACKAGE_TOOL,
  generator: TEMPLATE_NAME,
  templateName: TEMPLATE_NAME,
  templateVersion,
  runtimePackageName: RUNTIME_PACKAGE_NAME,
  runtimePackageVersion,
  runtimePackageGitHead,
  runtimeContractVersion: RUNTIME_CONTRACT_VERSION,
  artifactId: manifest.artifactId,
  folderName,
  sourcePackage: `src/vaults/${folderName}`,
  packagedAt,
  check: {
    passed: checkSummary.blocking === 0,
    summary: checkSummary,
  },
  requiredSourceFiles: REQUIRED_SOURCE_FILES.map((file) => `src/vaults/${folderName}/${file}`),
  fileSha256: {
    ...sourceFileHashes,
    [schemaPath]: schemaSha256,
  },
};

const metadata = {
  packageKind: PACKAGE_KIND,
  packageFormatVersion: PACKAGE_FORMAT_VERSION,
  packageMarkerFile: PACKAGE_MARKER_FILE,
  generatedBy: PACKAGE_TOOL,
  generator: TEMPLATE_NAME,
  templateName: TEMPLATE_NAME,
  templateVersion,
  runtimePackageName: RUNTIME_PACKAGE_NAME,
  runtimePackageVersion,
  runtimePackageGitHead,
  runtimeContractVersion: RUNTIME_CONTRACT_VERSION,
  artifactId: manifest.artifactId,
  folderName,
  name: manifest.name,
  bindingKeys: (manifest.match?.bindings || []).flatMap((binding) => {
    if (binding.factoryAddress) return [`${binding.chainId}:${binding.factoryAddress.toLowerCase()}`];
    const vaultAddress = binding.vaultAddresses?.[0];
    if (!vaultAddress) return [];
    if (Array.isArray(binding.tokenAddresses) && binding.tokenAddresses[0]) {
      return [`${binding.chainId}:vault:${vaultAddress.toLowerCase()}:${binding.tokenAddresses[0].toLowerCase()}`];
    }
    return [`${binding.chainId}:vault:${vaultAddress.toLowerCase()}`];
  }),
  packagedAt,
  manifestSha256: hashFile(path.join(vaultDir, "manifest.json")),
  sourcePackage: `src/vaults/${folderName}`,
  checkSummary,
};

archive.append(JSON.stringify(packageMarker, null, 2), { name: PACKAGE_MARKER_FILE });
archive.append(JSON.stringify(metadata, null, 2), { name: "package-metadata.json" });

await archive.finalize();

await new Promise((resolve, reject) => {
  output.on("close", resolve);
  output.on("error", reject);
});

const zipHash = hashFile(outFile);
const sourcePackagePath = path.relative(ROOT, outFile);
console.log(
  JSON.stringify(
    {
      ok: true,
      file: sourcePackagePath,
      sourcePackagePath,
      sourcePackageAbsolutePath: outFile,
      packageKind: PACKAGE_KIND,
      packageFormatVersion: PACKAGE_FORMAT_VERSION,
      packageMarkerFile: PACKAGE_MARKER_FILE,
      templateName: TEMPLATE_NAME,
      templateVersion,
      runtimePackageName: RUNTIME_PACKAGE_NAME,
      runtimePackageVersion,
      runtimePackageGitHead,
      runtimeContractVersion: RUNTIME_CONTRACT_VERSION,
      artifactId: manifest.artifactId,
      folderName,
      sha256: zipHash,
      bytes: fs.statSync(outFile).size,
      message: `Source package written to ${sourcePackagePath}. Submit this zip only; manually assembled zips without ${PACKAGE_MARKER_FILE} should be rejected by the Flap Artifact Workbench.`,
    },
    null,
    2,
  ),
);
