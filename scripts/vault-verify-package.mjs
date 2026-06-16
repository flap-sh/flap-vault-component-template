#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";
import { failAgent } from "./agent-error.mjs";
import {
  E2E_REPORT_PACKAGE_PATH,
  summarizeE2EReportForMarker,
  validateE2EReportObject,
} from "./e2e-report-utils.mjs";
import { collectE2EReportErc20TokenIssues, collectManifestErc20TokenIssues } from "./erc20-token-validation.mjs";

const PACKAGE_KIND = "flap-vault-ui-source-package";
const PACKAGE_FORMAT_VERSION = 4;
const PACKAGE_MARKER_FILE = "flap-vault-package.json";
const PACKAGE_METADATA_FILE = "package-metadata.json";
const SCHEMA_FILE = "schemas/manifest.schema.json";
const PACKAGE_TOOL = "yarn vault:package";
const PACKAGE_GENERATOR = "flap-vault-ui-template";
const RUNTIME_PACKAGE_NAME = "@flapsdk/vault-runtime";
const RUNTIME_CONTRACT_VERSION = 1;
const REQUIRED_SOURCE_FILES = ["Component.tsx", "manifest.json", "VaultABI.ts", "i18n.json"];
const FOLDER_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function jsonIssue(ruleId, message, fixHint, extra = {}) {
  return { severity: "blocking", ruleId, message, fixHint, ...extra };
}

function failVerify({ code, message, fixHint, issues = [], extra = {} }) {
  failAgent({
    code,
    message,
    fixHint,
    nextActions: issues.length
      ? issues.slice(0, 8).map((item) => ({
          ruleId: item.ruleId,
          severity: item.severity,
          file: item.file,
          fixHint: item.fixHint,
        }))
      : undefined,
    extra: {
      issues,
      ...extra,
    },
  });
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== EOCD_SIGNATURE) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) return offset;
  }
  return -1;
}

function readZipEntries(zipPath) {
  const buffer = fs.readFileSync(zipPath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) {
    failVerify({
      code: "package-verify/invalid-zip",
      message: "Cannot locate ZIP central directory.",
      fixHint: "Regenerate the source package with yarn vault:package <folder-name>.",
      extra: { sourcePackagePath: zipPath },
    });
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  let cursor = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_DIRECTORY_SIGNATURE) {
      failVerify({
        code: "package-verify/invalid-zip",
        message: "Invalid ZIP central directory entry.",
        fixHint: "Regenerate the source package with yarn vault:package <folder-name>.",
        extra: { sourcePackagePath: zipPath },
      });
    }

    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + fileNameLength).toString("utf8");
    cursor += 46 + fileNameLength + extraLength + commentLength;

    if (name.endsWith("/")) continue;
    if (entries.has(name)) {
      failVerify({
        code: "package-verify/duplicate-entry",
        message: `Duplicate ZIP entry path: ${name}`,
        fixHint: "Regenerate the source package with yarn vault:package <folder-name>; duplicate entries are not accepted.",
        extra: { sourcePackagePath: zipPath, entry: name },
      });
    }
    if (name.startsWith("/") || name.includes("../") || name.includes("..\\")) {
      failVerify({
        code: "package-verify/path-traversal",
        message: `Unsafe ZIP entry path: ${name}`,
        fixHint: "Regenerate the source package with yarn vault:package <folder-name>; do not hand-build zips.",
        extra: { sourcePackagePath: zipPath, entry: name },
      });
    }
    if (buffer.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_SIGNATURE) {
      failVerify({
        code: "package-verify/invalid-zip",
        message: `Invalid local ZIP header for ${name}.`,
        fixHint: "Regenerate the source package with yarn vault:package <folder-name>.",
        extra: { sourcePackagePath: zipPath, entry: name },
      });
    }

    const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const localName = buffer.subarray(localHeaderOffset + 30, localHeaderOffset + 30 + localFileNameLength).toString("utf8");
    if (localName !== name) {
      failVerify({
        code: "package-verify/header-name-mismatch",
        message: `ZIP local header name ${localName} does not match central directory name ${name}.`,
        fixHint: "Regenerate the source package with yarn vault:package <folder-name>; do not hand-build zips.",
        extra: { sourcePackagePath: zipPath, entry: name, localName },
      });
    }
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let content;
    if (compressionMethod === 0) {
      content = Buffer.from(compressed);
    } else if (compressionMethod === 8) {
      content = zlib.inflateRawSync(compressed);
    } else {
      failVerify({
        code: "package-verify/unsupported-compression",
        message: `Unsupported ZIP compression method ${compressionMethod} for ${name}.`,
        fixHint: "Regenerate the source package with yarn vault:package <folder-name>.",
        extra: { sourcePackagePath: zipPath, entry: name, compressionMethod },
      });
    }
    entries.set(name, content);
  }

  return { buffer, entries };
}

function readJsonEntry(entries, entryName) {
  try {
    return JSON.parse(entries.get(entryName).toString("utf8"));
  } catch (error) {
    failVerify({
      code: "package-verify/invalid-json",
      message: `Cannot parse ${entryName}: ${error.message}`,
      fixHint: "Regenerate the source package with yarn vault:package <folder-name>.",
      extra: { entryName },
    });
  }
}

function expectedSourceFiles(folderName) {
  return REQUIRED_SOURCE_FILES.map((file) => `src/vaults/${folderName}/${file}`);
}

async function verifyPackage(zipPath) {
  const absolutePath = path.resolve(zipPath);
  if (!fs.existsSync(absolutePath)) {
    failVerify({
      code: "package-verify/missing-package",
      message: `Source package not found: ${zipPath}`,
      fixHint: "Run yarn vault:package <folder-name>, then pass the generated dist/<folder-name>.zip path.",
      extra: { sourcePackagePath: zipPath },
    });
  }

  const { buffer, entries } = readZipEntries(absolutePath);
  const issues = [];
  const names = [...entries.keys()].sort();

  if (!entries.has(PACKAGE_MARKER_FILE)) {
    issues.push(
      jsonIssue(
        "package-verify/missing-marker",
        `${PACKAGE_MARKER_FILE} is missing.`,
        `Regenerate the source package with yarn vault:package <folder-name>; manually assembled zips are not accepted.`,
        { file: PACKAGE_MARKER_FILE },
      ),
    );
  }
  if (issues.length) {
    failVerify({
      code: issues[0].ruleId,
      message: issues[0].message,
      fixHint: issues[0].fixHint,
      issues,
      extra: { sourcePackagePath: absolutePath, entries: names },
    });
  }

  const marker = readJsonEntry(entries, PACKAGE_MARKER_FILE);
  const folderName = marker.folderName;
  if (marker.kind !== PACKAGE_KIND) {
    issues.push(jsonIssue("package-verify/invalid-kind", `Package kind must be ${PACKAGE_KIND}.`, "Regenerate the package with the current yarn vault:package script.", { file: PACKAGE_MARKER_FILE }));
  }
  if (marker.formatVersion !== PACKAGE_FORMAT_VERSION) {
    issues.push(
      jsonIssue(
        "package-verify/invalid-format-version",
        `Package format version must be ${PACKAGE_FORMAT_VERSION}.`,
        "Use a compatible Flap Artifact Workbench verifier or regenerate the package with this template version.",
        { file: PACKAGE_MARKER_FILE },
      ),
    );
  }
  if (marker.generatedBy !== PACKAGE_TOOL) {
    issues.push(jsonIssue("package-verify/invalid-generator-tool", `Package marker generatedBy must be ${PACKAGE_TOOL}.`, "Regenerate the package with the current yarn vault:package script.", { file: PACKAGE_MARKER_FILE }));
  }
  if (marker.generator !== PACKAGE_GENERATOR) {
    issues.push(jsonIssue("package-verify/invalid-generator", `Package marker generator must be ${PACKAGE_GENERATOR}.`, "Regenerate the package with the current yarn vault:package script.", { file: PACKAGE_MARKER_FILE }));
  }
  if (marker.templateName !== PACKAGE_GENERATOR) {
    issues.push(jsonIssue("package-verify/invalid-template-name", `Package marker templateName must be ${PACKAGE_GENERATOR}.`, "Regenerate the package with the current yarn vault:package script.", { file: PACKAGE_MARKER_FILE }));
  }
  if (typeof marker.templateVersion !== "string" || !marker.templateVersion) {
    issues.push(jsonIssue("package-verify/missing-template-version", "Package marker must include templateVersion.", "Regenerate with the current yarn vault:package script.", { file: PACKAGE_MARKER_FILE }));
  }
  if (marker.runtimePackageName !== RUNTIME_PACKAGE_NAME) {
    issues.push(jsonIssue("package-verify/invalid-runtime-package", `Package marker runtimePackageName must be ${RUNTIME_PACKAGE_NAME}.`, "Regenerate with the current yarn vault:package script.", { file: PACKAGE_MARKER_FILE }));
  }
  if (marker.runtimePackageVersion !== marker.templateVersion) {
    issues.push(jsonIssue("package-verify/runtime-version-mismatch", "Package marker runtimePackageVersion must match templateVersion.", "Regenerate with the current yarn vault:package script.", { file: PACKAGE_MARKER_FILE }));
  }
  if (typeof marker.runtimePackageGitHead !== "string" || !/^[a-f0-9]{40}$/i.test(marker.runtimePackageGitHead)) {
    issues.push(jsonIssue("package-verify/missing-runtime-git-head", "Package marker must include runtimePackageGitHead from npm latest @flapsdk/vault-runtime.", "Regenerate with the current yarn vault:package script after npm latest exposes gitHead provenance.", { file: PACKAGE_MARKER_FILE }));
  }
  if (marker.runtimeContractVersion !== RUNTIME_CONTRACT_VERSION) {
    issues.push(jsonIssue("package-verify/invalid-runtime-contract", `Package marker runtimeContractVersion must be ${RUNTIME_CONTRACT_VERSION}.`, "Regenerate with the current yarn vault:package script.", { file: PACKAGE_MARKER_FILE }));
  }
  if (typeof folderName !== "string" || !FOLDER_NAME_RE.test(folderName)) {
    issues.push(jsonIssue("package-verify/invalid-folder-name", "Package marker has an invalid folderName.", "Regenerate with yarn vault:package <folder-name> from a valid Vault folder.", { file: PACKAGE_MARKER_FILE }));
  }

  if (!issues.length) {
    const sourceFiles = expectedSourceFiles(folderName);
    const expectedFiles = new Set([PACKAGE_MARKER_FILE, PACKAGE_METADATA_FILE, SCHEMA_FILE, E2E_REPORT_PACKAGE_PATH, ...sourceFiles]);
    if (marker.sourcePackage !== `src/vaults/${folderName}`) {
      issues.push(jsonIssue("package-verify/source-package-mismatch", "Package marker sourcePackage does not match folderName.", "Regenerate with yarn vault:package <folder-name>; metadata must not be hand-edited.", { file: PACKAGE_MARKER_FILE }));
    }
    if (marker.check?.passed !== true || marker.check?.summary?.blocking !== 0) {
      issues.push(jsonIssue("package-verify/check-not-passed", "Package marker must record a passing vault:check result with zero blocking issues.", "Fix source issues and regenerate with yarn vault:package <folder-name>.", { file: PACKAGE_MARKER_FILE }));
    }
    for (const expected of expectedFiles) {
      if (!entries.has(expected)) {
        issues.push(jsonIssue("package-verify/missing-entry", `Missing package entry ${expected}.`, "Regenerate with yarn vault:package <folder-name>; do not hand-edit package contents.", { file: expected }));
      }
    }
    for (const name of names) {
      if (!expectedFiles.has(name)) {
        issues.push(jsonIssue("package-verify/unexpected-entry", `Unexpected package entry ${name}.`, "Keep source packages limited to the four Vault files, schema, metadata, and package marker.", { file: name }));
      }
    }

    const listedSourceFiles = Array.isArray(marker.requiredSourceFiles) ? [...marker.requiredSourceFiles].sort() : [];
    if (JSON.stringify(listedSourceFiles) !== JSON.stringify([...sourceFiles].sort())) {
      issues.push(
        jsonIssue(
          "package-verify/source-file-list-mismatch",
          "Package marker requiredSourceFiles does not match the strict Vault file set.",
          "Regenerate with yarn vault:package <folder-name> from a valid four-file Vault package.",
          { file: PACKAGE_MARKER_FILE },
        ),
      );
    }

    const filesToHash = [...sourceFiles, SCHEMA_FILE, E2E_REPORT_PACKAGE_PATH];
    for (const file of filesToHash) {
      if (!entries.has(file)) continue;
      const expectedHash = marker.fileSha256?.[file];
      const actualHash = sha256(entries.get(file));
      if (expectedHash !== actualHash) {
        issues.push(jsonIssue("package-verify/hash-mismatch", `SHA-256 mismatch for ${file}.`, "Regenerate with yarn vault:package <folder-name>; do not modify zips after packaging.", { file }));
      }
    }

    let manifest;
    if (entries.has(`src/vaults/${folderName}/manifest.json`)) {
      manifest = readJsonEntry(entries, `src/vaults/${folderName}/manifest.json`);
      if (manifest.artifactId !== marker.artifactId) {
        issues.push(jsonIssue("package-verify/artifact-id-mismatch", "Package marker artifactId does not match manifest.json.", "Regenerate with yarn vault:package <folder-name> from the current source.", { file: "manifest.json" }));
      }
      issues.push(
        ...(await collectManifestErc20TokenIssues(manifest, {
          file: `src/vaults/${folderName}/manifest.json`,
        })),
      );
    }

    let e2eReport;
    if (entries.has(E2E_REPORT_PACKAGE_PATH)) {
      e2eReport = readJsonEntry(entries, E2E_REPORT_PACKAGE_PATH);
      const expectedE2EFileHashes = Object.fromEntries(
        [...sourceFiles, SCHEMA_FILE].filter((file) => entries.has(file)).map((file) => [file, sha256(entries.get(file))]),
      );
      validateE2EReportObject(e2eReport, {
        folderName,
        manifest,
        expectedFileSha256: expectedE2EFileHashes,
        issues,
        file: E2E_REPORT_PACKAGE_PATH,
      });
      issues.push(...(await collectE2EReportErc20TokenIssues(e2eReport, { file: E2E_REPORT_PACKAGE_PATH, folderName })));
      const expectedE2ESummary = summarizeE2EReportForMarker(e2eReport);
      if (JSON.stringify(marker.e2e) !== JSON.stringify(expectedE2ESummary)) {
        issues.push(
          jsonIssue(
            "package-verify/e2e-marker-mismatch",
            "Package marker e2e summary does not match qa/e2e-report.json.",
            "Regenerate with yarn vault:e2e <folder-name> and yarn vault:package <folder-name>; metadata must not be hand-edited.",
            { file: PACKAGE_MARKER_FILE },
          ),
        );
      }
    }

    if (entries.has(PACKAGE_METADATA_FILE)) {
      const metadata = readJsonEntry(entries, PACKAGE_METADATA_FILE);
      if (
        metadata.packageKind !== PACKAGE_KIND ||
        metadata.packageFormatVersion !== PACKAGE_FORMAT_VERSION ||
        metadata.folderName !== folderName ||
        metadata.artifactId !== marker.artifactId ||
        metadata.templateName !== marker.templateName ||
        metadata.templateVersion !== marker.templateVersion ||
        metadata.runtimePackageName !== marker.runtimePackageName ||
        metadata.runtimePackageVersion !== marker.runtimePackageVersion ||
        metadata.runtimePackageGitHead !== marker.runtimePackageGitHead ||
        metadata.runtimeContractVersion !== marker.runtimeContractVersion ||
        JSON.stringify(metadata.e2e) !== JSON.stringify(marker.e2e)
      ) {
        issues.push(
          jsonIssue(
            "package-verify/metadata-mismatch",
            "package-metadata.json does not match the package marker.",
            "Regenerate with yarn vault:package <folder-name>; metadata must not be hand-edited.",
            { file: PACKAGE_METADATA_FILE },
          ),
        );
      }
    }
  }

  if (issues.length) {
    failVerify({
      code: issues[0].ruleId,
      message: issues[0].message,
      fixHint: issues[0].fixHint,
      issues,
      extra: { sourcePackagePath: absolutePath, entries: names },
    });
  }

  return {
    ok: true,
    sourcePackagePath: path.relative(process.cwd(), absolutePath),
    sourcePackageAbsolutePath: absolutePath,
    packageKind: PACKAGE_KIND,
    packageFormatVersion: PACKAGE_FORMAT_VERSION,
    packageMarkerFile: PACKAGE_MARKER_FILE,
    templateName: marker.templateName,
    templateVersion: marker.templateVersion,
    runtimePackageName: marker.runtimePackageName,
    runtimePackageVersion: marker.runtimePackageVersion,
    runtimePackageGitHead: marker.runtimePackageGitHead,
    runtimeContractVersion: marker.runtimeContractVersion,
    folderName,
    artifactId: marker.artifactId,
    sha256: sha256(buffer),
    entries: names,
    message: "Source package marker, file list, metadata, and hashes are valid.",
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const packagePath = process.argv[2];
  if (!packagePath) {
    failVerify({
      code: "cli/missing-package-path",
      message: "Usage: yarn vault:verify-package dist/<folder-name>.zip",
      fixHint: "Run yarn vault:package <folder-name>, then pass the generated sourcePackagePath.",
    });
  }
  console.log(JSON.stringify(await verifyPackage(packagePath), null, 2));
}

export { verifyPackage };
