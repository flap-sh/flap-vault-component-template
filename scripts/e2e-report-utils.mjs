import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  MINI_APP_CAPABILITY_CONFIG_PATH,
  capabilityFileExtensions,
  manifestCapabilityIds,
} from "./mini-app-capabilities.mjs";

export const E2E_REPORT_KIND = "flap-vault-ui-e2e-report";
export const E2E_REPORT_VERSION = 2;
export const E2E_REPORT_PACKAGE_PATH = "qa/e2e-report.json";
export const E2E_REPORT_TOOL = "yarn vault:e2e";
export const E2E_DIST_DIR = "dist/e2e";
export const MANIFEST_SCHEMA_PATH = "schemas/manifest.schema.json";
export { MINI_APP_CAPABILITY_CONFIG_PATH };
export const REQUIRED_SOURCE_FILES = ["Component.tsx", "manifest.json", "VaultABI.ts", "i18n.json"];
export const MINI_APP_MODE = "mini-app";
export const MINI_APP_AUDIO_ASSET_EXTENSIONS = [".mp3", ".wav", ".ogg", ".m4a", ".aac"];
export const MINI_APP_AUDIO_ASSET_RE = /^[a-z0-9][a-z0-9._-]{0,79}\.(?:mp3|wav|ogg|m4a|aac)$/;
export const MINI_APP_AUDIO_MAX_BYTES = 5 * 1024 * 1024;
export const MINI_APP_AUDIO_TOTAL_MAX_BYTES = 12 * 1024 * 1024;
export const REQUIRED_VIEWPORTS = ["pc", "ipad", "h5"];
export const REQUIRED_PHASES = ["default", "internal-market", "dex-listed"];
export const MINI_APP_PLACEHOLDER_TOKEN_ADDRESS = "0x0000000000000000000000000000000000008888";
const PACKAGE_TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".json", ".glsl", ".vert", ".frag", ".gltf"]);

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const REQUIRED_TEST_TOKEN_SUFFIXES = ["7777", "8888"];
const REQUIRED_TEST_TOKEN_SUFFIX = REQUIRED_TEST_TOKEN_SUFFIXES.join(" or ");
const SUPPORTED_E2E_CHAIN_IDS = new Set([56, 97, 4663, 46630]);
const DEFAULT_E2E_TOKEN_ADDRESSES = new Map([
  [56, "0x286184b2660a2822671a33f24c4517f593947777"],
  [97, "0xf8ac72e7adefbce6ff22d9a9238512933e247777"],
  [4663, "0x10b90dd1d5a999c2ff9c034d13be55a7ba788888"],
  [46630, "0xbd2e243911c9cded8b2637f90439cb5777988888"],
]);
const RESERVED_PLACEHOLDER_ADDRESSES = new Map([
  [MINI_APP_PLACEHOLDER_TOKEN_ADDRESS, "standard Mini App token placeholder"],
  ["0x1000000000000000000000000000000000000001", "template factory placeholder"],
  ["0x2000000000000000000000000000000000000002", "template token placeholder"],
  ["0x2000000000000000000000000000000000000005", "template token placeholder"],
]);

export function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

export function normalizePackageTextBuffer(buffer) {
  return Buffer.from(buffer.toString("utf8").replace(/\r\n?/g, "\n"), "utf8");
}

export function readPackageFileBuffer(filePath) {
  return PACKAGE_TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())
    ? normalizePackageTextBuffer(fs.readFileSync(filePath))
    : fs.readFileSync(filePath);
}

export function normalizeAddress(value) {
  return typeof value === "string" && ADDRESS_RE.test(value) ? value : undefined;
}

export function placeholderAddressLabel(value) {
  const normalized = normalizeAddress(value)?.toLowerCase();
  return normalized ? RESERVED_PLACEHOLDER_ADDRESSES.get(normalized) : undefined;
}

function validTestToken(value) {
  const address = normalizeAddress(value);
  return address && !placeholderAddressLabel(address) && REQUIRED_TEST_TOKEN_SUFFIXES.some((suffix) => address.toLowerCase().endsWith(suffix)) ? address : undefined;
}

export function requiredSourcePaths(folderName) {
  return REQUIRED_SOURCE_FILES.map((file) => `src/vaults/${folderName}/${file}`);
}

export function isMiniAppAudioAssetName(name) {
  return MINI_APP_AUDIO_ASSET_RE.test(name);
}

function readManifest(root, folderName) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, "src", "vaults", folderName, "manifest.json"), "utf8"));
  } catch {
    return {};
  }
}

export function collectMiniAppAudioAssetPaths(root, folderName) {
  if (readManifest(root, folderName)?.mode !== MINI_APP_MODE) return [];
  const vaultDir = path.join(root, "src", "vaults", folderName);
  try {
    return fs
      .readdirSync(vaultDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isMiniAppAudioAssetName(entry.name))
      .map((entry) => `src/vaults/${folderName}/${entry.name}`)
      .sort();
  } catch {
    return [];
  }
}

function walkFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, files);
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

export function collectCapabilitySourcePaths(root, folderName) {
  const manifest = readManifest(root, folderName);
  if (manifest?.mode !== MINI_APP_MODE || manifestCapabilityIds(manifest).length === 0) return [];
  const vaultDir = path.join(root, "src", "vaults", folderName);
  const extensions = capabilityFileExtensions(manifest, root);
  return walkFiles(vaultDir)
    .filter((filePath) => extensions.has(path.extname(filePath).toLowerCase()))
    .map((filePath) => path.relative(root, filePath).split(path.sep).join("/"))
    .sort();
}

export function sourcePackagePaths(root, folderName) {
  return [...new Set([...requiredSourcePaths(folderName), ...collectMiniAppAudioAssetPaths(root, folderName), ...collectCapabilitySourcePaths(root, folderName)])].sort();
}

export function collectSourceHashes(root, folderName) {
  const hashes = {};
  for (const filePath of sourcePackagePaths(root, folderName)) {
    hashes[filePath] = sha256Buffer(readPackageFileBuffer(path.join(root, filePath)));
  }
  hashes[MANIFEST_SCHEMA_PATH] = sha256Buffer(readPackageFileBuffer(path.join(root, MANIFEST_SCHEMA_PATH)));
  hashes[MINI_APP_CAPABILITY_CONFIG_PATH] = sha256Buffer(readPackageFileBuffer(path.join(root, MINI_APP_CAPABILITY_CONFIG_PATH)));
  return hashes;
}

export function sourceSha256FromFileHashes(fileSha256) {
  const canonical = Object.keys(fileSha256)
    .sort()
    .map((key) => `${key}:${fileSha256[key]}`)
    .join("\n");
  return sha256Buffer(Buffer.from(canonical, "utf8"));
}

export function findE2EReportPath(root, folderName) {
  return path.join(root, E2E_DIST_DIR, folderName, "qa-report.json");
}

function firstAddress(values) {
  if (!Array.isArray(values)) return undefined;
  for (const value of values) {
    const address = normalizeAddress(value);
    if (address) return address;
  }
  return undefined;
}

function firstValidTestToken(values) {
  if (!Array.isArray(values)) return undefined;
  for (const value of values) {
    const address = validTestToken(value);
    if (address) return address;
  }
  return undefined;
}

function bindingToken(binding, overrides = {}) {
  return validTestToken(overrides.tokenAddress) ?? firstValidTestToken(binding?.tokenAddresses);
}

function bindingVault(binding, overrides = {}) {
  return normalizeAddress(overrides.vaultAddress) ?? firstAddress(binding?.vaultAddresses);
}

function bindingFactory(binding, overrides = {}) {
  return normalizeAddress(overrides.factoryAddress) ?? normalizeAddress(binding?.factoryAddress);
}

function manifestTokenAddresses(manifest) {
  const bindings = Array.isArray(manifest?.match?.bindings) ? manifest.match.bindings : [];
  return bindings
    .flatMap((binding) => (Array.isArray(binding?.tokenAddresses) ? binding.tokenAddresses : []))
    .map(validTestToken)
    .filter(Boolean)
    .map((address) => address.toLowerCase());
}

function usesMiniAppPlaceholder(manifest) {
  return manifest?.mode === MINI_APP_MODE && (manifest?.match?.bindings ?? []).some((binding) =>
    (binding?.tokenAddresses ?? []).some((address) => address?.toLowerCase?.() === MINI_APP_PLACEHOLDER_TOKEN_ADDRESS),
  );
}

export function selectE2EBinding(manifest, overrides = {}) {
  const bindings = Array.isArray(manifest?.match?.bindings) ? manifest.match.bindings : [];
  const requestedChainId = Number.isInteger(overrides.chainId) ? overrides.chainId : undefined;
  const candidates = bindings
    .filter((binding) => !requestedChainId || binding.chainId === requestedChainId)
    .map((binding) => ({
      binding,
      chainId: binding.chainId,
      tokenAddress: bindingToken(binding, overrides),
      vaultAddress: bindingVault(binding, overrides),
      factoryAddress: bindingFactory(binding, overrides),
    }))
    .filter((item) => SUPPORTED_E2E_CHAIN_IDS.has(item.chainId));

  if (manifest?.mode === MINI_APP_MODE) {
    for (const item of candidates) {
      const hasPlaceholder = item.binding?.tokenAddresses?.some(
        (address) => address?.toLowerCase?.() === MINI_APP_PLACEHOLDER_TOKEN_ADDRESS,
      );
      if (hasPlaceholder && !item.tokenAddress) item.tokenAddress = validTestToken(overrides.token) ?? DEFAULT_E2E_TOKEN_ADDRESSES.get(item.chainId);
    }
  }

  const selected = candidates.find((item) => item.tokenAddress);
  if (selected) {
    return {
      ...selected,
      tokenPolicy:
        selected.chainId === 97
          ? "testnet"
          : selected.chainId === 4663
            ? "robinhood-mainnet"
            : selected.chainId === 46630
              ? "robinhood-testnet"
              : "mainnet-fallback",
    };
  }

  const chainLabel = requestedChainId ? `chainId ${requestedChainId}` : "BNB testnet, BNB mainnet, Robinhood Chain, or Robinhood Testnet";
  throw new Error(
    `vault:e2e requires a real non-placeholder test token ending in ${REQUIRED_TEST_TOKEN_SUFFIX} for ${chainLabel}. Declare it in match.bindings[].tokenAddresses, or pass --token only for local self-test.`,
  );
}

export function summarizeE2EReportForMarker(report) {
  return {
    passed: report?.passed === true,
    reportFile: E2E_REPORT_PACKAGE_PATH,
    sourceSha256: report?.sourceSha256,
    manifestSha256: report?.manifestSha256,
    chainId: report?.binding?.chainId,
    tokenAddress: report?.binding?.tokenAddress,
    tokenPolicy: report?.binding?.tokenPolicy,
    viewportCount: Array.isArray(report?.viewports) ? report.viewports.length : 0,
    phaseChecks: Array.isArray(report?.phases) ? report.phases : [],
    layoutCheckSummary: report?.layoutCheckSummary,
  };
}

export function validateE2EReportObject(report, { root, folderName, manifest, expectedFileSha256, issues, file = E2E_REPORT_PACKAGE_PATH }) {
  const addIssue = (ruleId, message, extra = {}) => {
    issues.push({
      severity: "blocking",
      ruleId,
      message,
      fixHint: `Run ${E2E_REPORT_TOOL} ${folderName}, then regenerate the source package.`,
      file,
      ...extra,
    });
  };

  if (!report || typeof report !== "object" || Array.isArray(report)) {
    addIssue("e2e-report/invalid-json", "E2E report must be a JSON object.");
    return;
  }
  if (report.kind !== E2E_REPORT_KIND || report.schemaVersion !== E2E_REPORT_VERSION) {
    addIssue("e2e-report/invalid-kind", `E2E report must be ${E2E_REPORT_KIND} schema version ${E2E_REPORT_VERSION}.`);
  }
  if (report.generatedBy !== E2E_REPORT_TOOL) {
    addIssue("e2e-report/invalid-generator", `E2E report generatedBy must be ${E2E_REPORT_TOOL}.`);
  }
  if (report.folderName !== folderName) {
    addIssue("e2e-report/folder-mismatch", `E2E report folderName mismatch: ${report.folderName ?? "<missing>"} != ${folderName}.`);
  }
  if (manifest?.artifactId && report.artifactId !== manifest.artifactId) {
    addIssue("e2e-report/artifact-mismatch", "E2E report artifactId does not match manifest.json.");
  }
  if (report.passed !== true || (report.summary?.blocking ?? 1) !== 0) {
    addIssue("e2e-report/not-passed", "E2E report must record passed=true and zero blocking issues.");
  }

  const expectedHashes = expectedFileSha256 ?? (root ? collectSourceHashes(root, folderName) : undefined);
  if (expectedHashes) {
    for (const [filePath, expectedHash] of Object.entries(expectedHashes)) {
      const actualHash = report.fileSha256?.[filePath];
      if (actualHash !== expectedHash) {
        addIssue("e2e-report/source-hash-mismatch", `E2E report hash for ${filePath} is stale or missing.`, {
          expected: expectedHash,
          actual: actualHash,
        });
      }
    }
    const expectedSourceSha = sourceSha256FromFileHashes(expectedHashes);
    if (report.sourceSha256 !== expectedSourceSha) {
      addIssue("e2e-report/source-sha-mismatch", "E2E report sourceSha256 does not match the uploaded source files.", {
        expected: expectedSourceSha,
        actual: report.sourceSha256,
      });
    }
    const componentPath = `src/vaults/${folderName}/Component.tsx`;
    if (report.previewSource?.verified !== true || report.previewSource?.componentSha256 !== expectedHashes[componentPath]) {
      addIssue("e2e-report/preview-source-unverified", "E2E report must prove that the preview server served the uploaded Component.tsx source.", {
        expected: expectedHashes[componentPath],
        actual: report.previewSource?.componentSha256,
      });
    }
  }

  if (typeof report.manifestSha256 !== "string" || report.manifestSha256 !== report.fileSha256?.[`src/vaults/${folderName}/manifest.json`]) {
    addIssue("e2e-report/manifest-sha-mismatch", "E2E report manifestSha256 must match manifest.json in fileSha256.");
  }

  const binding = report.binding ?? {};
  if (!SUPPORTED_E2E_CHAIN_IDS.has(binding.chainId) || !normalizeAddress(binding.tokenAddress)) {
    addIssue("e2e-report/missing-test-token", "E2E report must bind to a supported-chain token used for package testing.");
  } else if (placeholderAddressLabel(binding.tokenAddress)) {
    addIssue("e2e-report/placeholder-test-token", "E2E report tokenAddress uses a reserved template placeholder instead of a real deployed token contract.", {
      field: "binding.tokenAddress",
      tokenAddress: binding.tokenAddress,
      fixHint: `Use a real deployed supported-chain token address, rerun ${E2E_REPORT_TOOL} ${folderName}, then regenerate the source package.`,
    });
  } else if (!validTestToken(binding.tokenAddress)) {
    addIssue("e2e-report/invalid-test-token-suffix", `E2E report tokenAddress must end in ${REQUIRED_TEST_TOKEN_SUFFIX}.`, {
      field: "binding.tokenAddress",
      tokenAddress: binding.tokenAddress,
      requiredSuffix: REQUIRED_TEST_TOKEN_SUFFIX,
      fixHint: `Use a real deployed supported-chain token address ending in ${REQUIRED_TEST_TOKEN_SUFFIX}, rerun ${E2E_REPORT_TOOL} ${folderName}, then regenerate the source package.`,
    });
  }
  if (binding.chainId === 97 && binding.tokenPolicy !== "testnet") {
    addIssue("e2e-report/token-policy-mismatch", "chainId 97 E2E reports must use tokenPolicy=testnet.");
  }
  if (binding.chainId === 56 && binding.tokenPolicy !== "mainnet-fallback") {
    addIssue("e2e-report/token-policy-mismatch", "chainId 56 E2E reports must use tokenPolicy=mainnet-fallback.");
  }
  if (binding.chainId === 4663 && binding.tokenPolicy !== "robinhood-mainnet") {
    addIssue("e2e-report/token-policy-mismatch", "chainId 4663 E2E reports must use tokenPolicy=robinhood-mainnet.");
  }
  if (binding.chainId === 46630 && binding.tokenPolicy !== "robinhood-testnet") {
    addIssue("e2e-report/token-policy-mismatch", "chainId 46630 E2E reports must use tokenPolicy=robinhood-testnet.");
  }
  const manifestTokens = manifestTokenAddresses(manifest);
  const tokenAddress = normalizeAddress(binding.tokenAddress)?.toLowerCase();
  if (manifestTokens.length === 0 && !usesMiniAppPlaceholder(manifest)) {
    addIssue("e2e-report/missing-manifest-test-token", `Manifest must declare at least one real non-placeholder tokenAddresses entry ending in ${REQUIRED_TEST_TOKEN_SUFFIX} for Workbench/E2E test coverage.`, {
      field: "match.bindings[].tokenAddresses",
      fixHint: `Add a real deployed token address ending in ${REQUIRED_TEST_TOKEN_SUFFIX} under at least one manifest match.bindings[].tokenAddresses entry, run ${E2E_REPORT_TOOL} ${folderName}, then regenerate the source package.`,
    });
  } else if (tokenAddress && manifestTokens.length > 0 && !manifestTokens.includes(tokenAddress)) {
    addIssue("e2e-report/token-address-mismatch", "E2E report tokenAddress must match a manifest tokenAddresses entry.", {
      fixHint: `Run ${E2E_REPORT_TOOL} ${folderName} with a manifest-declared token address, then regenerate the source package.`,
    });
  }

  const viewports = new Set(Array.isArray(report.viewports) ? report.viewports.map((item) => item.id) : []);
  for (const viewport of REQUIRED_VIEWPORTS) {
    if (!viewports.has(viewport)) addIssue("e2e-report/missing-viewport", `E2E report is missing viewport ${viewport}.`);
  }
  const phases = new Set(Array.isArray(report.phases) ? report.phases : []);
  for (const phase of REQUIRED_PHASES) {
    if (!phases.has(phase)) addIssue("e2e-report/missing-phase", `E2E report is missing phase ${phase}.`);
  }
}
