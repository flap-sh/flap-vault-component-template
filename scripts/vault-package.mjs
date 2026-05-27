#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import archiver from "archiver";
import { failAgent } from "./agent-error.mjs";
import { runVaultCheck } from "./vault-check.mjs";

const ROOT = process.cwd();
const PACKAGE_KIND = "flap-vault-ui-source-package";
const PACKAGE_FORMAT_VERSION = 1;
const PACKAGE_TOOL = "yarn vault:package";
const PACKAGE_MARKER_FILE = "flap-vault-package.json";
const REQUIRED_SOURCE_FILES = ["Component.tsx", "manifest.json", "VaultABI.ts", "i18n.json"];
const folderName = process.argv[2];
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
  generator: "flap-vault-ui-template",
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
  generator: "flap-vault-ui-template",
  artifactId: manifest.artifactId,
  folderName,
  name: manifest.name,
  bindingKeys: (manifest.match?.bindings || []).map((binding) => `${binding.chainId}-${binding.factoryAddress.toLowerCase()}`),
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
