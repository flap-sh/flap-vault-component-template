import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const E2E_REPORT_KIND = "flap-vault-ui-e2e-report";
export const E2E_REPORT_VERSION = 1;
export const E2E_REPORT_PACKAGE_PATH = "qa/e2e-report.json";
export const E2E_REPORT_TOOL = "yarn vault:e2e";
export const E2E_DIST_DIR = "dist/e2e";
export const MANIFEST_SCHEMA_PATH = "schemas/manifest.schema.json";
export const REQUIRED_SOURCE_FILES = ["Component.tsx", "manifest.json", "VaultABI.ts", "i18n.json"];
export const REQUIRED_VIEWPORTS = ["pc", "ipad", "h5"];
export const REQUIRED_PHASES = ["default", "internal-market", "dex-listed"];

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const REQUIRED_TEST_TOKEN_SUFFIXES = ["7777", "8888"];
const REQUIRED_TEST_TOKEN_SUFFIX = REQUIRED_TEST_TOKEN_SUFFIXES.join(" or ");
const RESERVED_PLACEHOLDER_ADDRESSES = new Map([
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

export function collectSourceHashes(root, folderName) {
  const hashes = {};
  for (const filePath of requiredSourcePaths(folderName)) {
    hashes[filePath] = sha256File(path.join(root, filePath));
  }
  hashes[MANIFEST_SCHEMA_PATH] = sha256File(path.join(root, MANIFEST_SCHEMA_PATH));
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
    .filter((item) => item.chainId === 97 || item.chainId === 56);

  const selected = candidates.find((item) => item.tokenAddress);
  if (selected) {
    return {
      ...selected,
      tokenPolicy: selected.chainId === 97 ? "testnet" : "mainnet-fallback",
    };
  }

  const chainLabel = requestedChainId ? `chainId ${requestedChainId}` : "BNB testnet or BNB mainnet";
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
  }

  if (typeof report.manifestSha256 !== "string" || report.manifestSha256 !== report.fileSha256?.[`src/vaults/${folderName}/manifest.json`]) {
    addIssue("e2e-report/manifest-sha-mismatch", "E2E report manifestSha256 must match manifest.json in fileSha256.");
  }

  const binding = report.binding ?? {};
  if ((binding.chainId !== 97 && binding.chainId !== 56) || !normalizeAddress(binding.tokenAddress)) {
    addIssue("e2e-report/missing-test-token", "E2E report must bind to a BNB chain token used for package testing.");
  } else if (placeholderAddressLabel(binding.tokenAddress)) {
    addIssue("e2e-report/placeholder-test-token", "E2E report tokenAddress uses a reserved template placeholder instead of a real deployed token contract.", {
      field: "binding.tokenAddress",
      tokenAddress: binding.tokenAddress,
      fixHint: `Use a real deployed BNB Chain token address, rerun ${E2E_REPORT_TOOL} ${folderName}, then regenerate the source package.`,
    });
  } else if (!validTestToken(binding.tokenAddress)) {
    addIssue("e2e-report/invalid-test-token-suffix", `E2E report tokenAddress must end in ${REQUIRED_TEST_TOKEN_SUFFIX}.`, {
      field: "binding.tokenAddress",
      tokenAddress: binding.tokenAddress,
      requiredSuffix: REQUIRED_TEST_TOKEN_SUFFIX,
      fixHint: `Use a real deployed BNB Chain token address ending in ${REQUIRED_TEST_TOKEN_SUFFIX}, rerun ${E2E_REPORT_TOOL} ${folderName}, then regenerate the source package.`,
    });
  }
  if (binding.chainId === 97 && binding.tokenPolicy !== "testnet") {
    addIssue("e2e-report/token-policy-mismatch", "chainId 97 E2E reports must use tokenPolicy=testnet.");
  }
  if (binding.chainId === 56 && binding.tokenPolicy !== "mainnet-fallback") {
    addIssue("e2e-report/token-policy-mismatch", "chainId 56 E2E reports must use tokenPolicy=mainnet-fallback.");
  }
  const manifestTokens = manifestTokenAddresses(manifest);
  const tokenAddress = normalizeAddress(binding.tokenAddress)?.toLowerCase();
  if (manifestTokens.length === 0) {
    addIssue("e2e-report/missing-manifest-test-token", `Manifest must declare at least one real non-placeholder tokenAddresses entry ending in ${REQUIRED_TEST_TOKEN_SUFFIX} for Workbench/E2E test coverage.`, {
      field: "match.bindings[].tokenAddresses",
      fixHint: `Add a real deployed token address ending in ${REQUIRED_TEST_TOKEN_SUFFIX} under at least one manifest match.bindings[].tokenAddresses entry, run ${E2E_REPORT_TOOL} ${folderName}, then regenerate the source package.`,
    });
  } else if (tokenAddress && !manifestTokens.includes(tokenAddress)) {
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
