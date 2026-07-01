#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  collectSourceHashes,
  E2E_DIST_DIR,
  E2E_REPORT_KIND,
  E2E_REPORT_TOOL,
  E2E_REPORT_VERSION,
  MANIFEST_SCHEMA_PATH,
  REQUIRED_PHASES,
  REQUIRED_VIEWPORTS,
  selectE2EBinding,
  sourceSha256FromFileHashes,
} from "./e2e-report-utils.mjs";
import { runVaultCheck, runVaultCheckWithTokenContracts } from "./vault-check.mjs";

const ROOT = process.cwd();
const FIXTURE_PREFIX = `check-selftest-${process.pid}-${Date.now()}`;
const FACTORY = "0xc3e4ee8f3c616d16297fafcb9daab122d31efa9e";
const PLACEHOLDER_FACTORY = "0x1000000000000000000000000000000000000001";
const PLACEHOLDER_TOKEN = "0x2000000000000000000000000000000000000002";
const NON_ERC20_TOKEN = "0x2000000000000000000000000000000000007777";
const NON_7777_TOKEN = "0x55d398326f99059fF775485246999027B3197955";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const TOKEN = "0x091652ebc0a0238d7151a868f22d7cfd2a267777";
const SECOND_TOKEN = "0x6BcC641D1eF33c4d7A2C9536a3E0356F77Ff7777";
const VAULT = "0x3000000000000000000000000000000000000003";
const EXTERNAL_CONTRACT = "0x4000000000000000000000000000000000000004";
const FIXTURE_ULID = "01K9V9Z0P0AAAAAAAAAAAAAAAA";
const TRADINGVIEW_FRAME_SRC = "https://s.tradingview.com/widgetembed/?symbol=NASDAQ%3ANVDA&interval=60&theme=dark&style=1";
const DEXSCREENER_FRAME_SRC = "https://dexscreener.com/bsc/0x1111111111111111111111111111111111111111?embed=1&theme=dark";
const INDEX_PATH = path.join(ROOT, "src", "vaults", "index.ts");
const originalIndex = fs.readFileSync(INDEX_PATH, "utf8");

const createdFolderNames = [];
const createdPackagePaths = [];
const passed = [];

function baseManifest(overrides = {}) {
  return {
    name: "Selftest Vault UI",
    match: {
      bindings: [{ chainId: 56, factoryAddress: FACTORY, tokenAddresses: [TOKEN] }],
    },
    i18n: ["en"],
    ...overrides,
  };
}

function artifactIdForFolderName(folderName) {
  return `vaultui_${folderName}_${FIXTURE_ULID}`;
}

function writeVault(folderName, { manifest = baseManifest(), component, abi = "export const vaultAbi = [] as const;\n", i18n } = {}) {
  const vaultDir = path.join(ROOT, "src", "vaults", folderName);
  fs.mkdirSync(vaultDir, { recursive: true });
  createdFolderNames.push(folderName);
  const nextManifest = {
    artifactId: artifactIdForFolderName(folderName),
    ...manifest,
  };
  fs.writeFileSync(
    path.join(vaultDir, "Component.tsx"),
    component ||
      `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  return <div>{i18n.t("title")}</div>;
}
`,
  );
  fs.writeFileSync(path.join(vaultDir, "manifest.json"), `${JSON.stringify(nextManifest, null, 2)}\n`);
  fs.writeFileSync(path.join(vaultDir, "VaultABI.ts"), abi);
  fs.writeFileSync(path.join(vaultDir, "i18n.json"), `${JSON.stringify(i18n || { en: { title: "Selftest" } }, null, 2)}\n`);
}

function writePassingE2EReport(folderName, { chainId = 56, tokenAddress = TOKEN, factoryAddress = FACTORY, vaultAddress } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "vaults", folderName, "manifest.json"), "utf8"));
  const fileSha256 = collectSourceHashes(ROOT, folderName);
  const sourceSha256 = sourceSha256FromFileHashes(fileSha256);
  const checks = REQUIRED_VIEWPORTS.flatMap((viewport) => [
    ...REQUIRED_PHASES.map((phase) => ({
      id: `${viewport}-${phase}`,
      viewport,
      phase,
      wrongNetwork: false,
      passed: true,
      issues: [],
    })),
    {
      id: `${viewport}-wrong-network`,
      viewport,
      phase: "internal-market",
      wrongNetwork: true,
      passed: true,
      issues: [],
    },
  ]);
  const report = {
    kind: E2E_REPORT_KIND,
    schemaVersion: E2E_REPORT_VERSION,
    generatedBy: E2E_REPORT_TOOL,
    generatedAt: new Date().toISOString(),
    folderName,
    artifactId: manifest.artifactId,
    sourcePackage: `src/vaults/${folderName}`,
    sourceSha256,
    fileSha256,
    manifestSha256: fileSha256[`src/vaults/${folderName}/manifest.json`],
    schemaSha256: fileSha256[MANIFEST_SCHEMA_PATH],
    binding: {
      chainId,
      tokenAddress,
      ...(vaultAddress ? { vaultAddress } : {}),
      ...(factoryAddress ? { factoryAddress } : {}),
      tokenPolicy: chainId === 97 ? "testnet" : "mainnet-fallback",
    },
    viewports: [
      { id: "pc", width: 1440, height: 900 },
      { id: "ipad", width: 834, height: 1194 },
      { id: "h5", width: 390, height: 844 },
    ],
    phases: REQUIRED_PHASES,
    passed: true,
    summary: { blocking: 0, warning: 0, info: checks.length },
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
    checks,
  };
  const reportDir = path.join(ROOT, E2E_DIST_DIR, folderName);
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, "qa-report.json"), `${JSON.stringify(report, null, 2)}\n`);
}

function assertRule(label, result, ruleId, severity) {
  const found = result.issues.find((item) => item.ruleId === ruleId && (!severity || item.severity === severity));
  assert.ok(found, `${label}: expected ${severity || "any"} ${ruleId}`);
  passed.push(label);
}

function assertNoRule(label, result, ruleId, severity) {
  const found = result.issues.find((item) => item.ruleId === ruleId && (!severity || item.severity === severity));
  assert.equal(found, undefined, `${label}: did not expect ${severity || "any"} ${ruleId}`);
  passed.push(label);
}

try {
  const invalidFolderResult = runVaultCheck("../bad", { silent: true });
  assertRule("invalid folder name is reported as JSON-compatible result", invalidFolderResult, "cli/invalid-folder-name", "blocking");
  assert.equal(invalidFolderResult.ok, false);
  assert.equal(invalidFolderResult.code, "cli/invalid-folder-name");
  assert.equal(invalidFolderResult.error, invalidFolderResult.issues[0].message);
  assert.equal(invalidFolderResult.fixHint, invalidFolderResult.issues[0].fixHint);
  assert.ok(invalidFolderResult.agent.nextActions[0].fixHint);
  passed.push("blocking check output exposes code, error, fixHint, and agent.nextActions");

  const artifactIdSlug = `${FIXTURE_PREFIX}-artifact-id`;
  writeVault(artifactIdSlug, {
    manifest: baseManifest({ artifactId: "vaultui_other-slug_01K9V9Z0P0BBBBBBBBBBBBBBBB" }),
  });
  assertRule("artifactId folder-name segment must match package folder", runVaultCheck(artifactIdSlug, { silent: true }), "manifest-schema/artifact-id-folder-name-mismatch", "blocking");

  const duplicateOneSlug = `${FIXTURE_PREFIX}-dup-one`;
  const duplicateTwoSlug = `${FIXTURE_PREFIX}-dup-two`;
  const duplicateArtifactId = `vaultui_${duplicateTwoSlug}_${FIXTURE_ULID}`;
  writeVault(duplicateOneSlug, {
    manifest: baseManifest({ artifactId: duplicateArtifactId }),
  });
  writeVault(duplicateTwoSlug, {
    manifest: baseManifest({ artifactId: duplicateArtifactId }),
  });
  assertRule("artifactId must be unique across Vault packages", runVaultCheck(duplicateTwoSlug, { silent: true }), "manifest-schema/duplicate-artifact-id", "blocking");

  const tokenPolicySlug = `${FIXTURE_PREFIX}-token-policy`;
  writeVault(tokenPolicySlug, {
    manifest: baseManifest({
      match: {
        bindings: [{ chainId: 56, factoryAddress: FACTORY, tokenAddresses: [TOKEN] }],
      },
    }),
  });
  const tokenPolicyCheck = runVaultCheck(tokenPolicySlug, { silent: true });
  assert.equal(tokenPolicyCheck.issues.some((item) => item.ruleId === "manifest-binding/ca-policy-not-in-manifest"), false);
  assert.equal(tokenPolicyCheck.issues.some((item) => item.ruleId === "manifest-binding/invalid-token-address-list"), false);
  assert.equal(tokenPolicyCheck.issues.some((item) => item.ruleId === "manifest-binding/missing-test-token"), false);
  passed.push("binding-level tokenAddresses reference lists are allowed");

  const standardLayoutSlug = `${FIXTURE_PREFIX}-standard-layout`;
  writeVault(standardLayoutSlug);
  const standardLayoutCheck = runVaultCheck(standardLayoutSlug, { silent: true });
  assertNoRule("omitted manifest layout keeps the standard layout without fullscreen review", standardLayoutCheck, "manual-review/fullscreen-layout", "warning");
  assert.equal(standardLayoutCheck.review.fullscreenLayouts.length, 0);
  passed.push("omitted manifest layout produces no fullscreen review output");

  const fullscreenLayoutSlug = `${FIXTURE_PREFIX}-fullscreen-layout`;
  writeVault(fullscreenLayoutSlug, {
    manifest: baseManifest({ layout: "fullscreen" }),
  });
  const fullscreenLayoutCheck = runVaultCheck(fullscreenLayoutSlug, { silent: true });
  assertRule("manifest layout fullscreen triggers manual review", fullscreenLayoutCheck, "manual-review/fullscreen-layout", "warning");
  assert.deepEqual(fullscreenLayoutCheck.review.fullscreenLayouts, [
    {
      layout: "fullscreen",
      field: "layout",
      severity: "warning",
      ruleId: "manual-review/fullscreen-layout",
    },
  ]);
  passed.push("fullscreen layout review output is machine-readable");

  for (const invalidLayout of ["fullwidth", "fullwide", "immersive"]) {
    const invalidLayoutSlug = `${FIXTURE_PREFIX}-${invalidLayout}`;
    writeVault(invalidLayoutSlug, {
      manifest: baseManifest({ layout: invalidLayout }),
    });
    assertRule(`manifest layout ${invalidLayout} is blocked`, runVaultCheck(invalidLayoutSlug, { silent: true }), "manifest-schema/invalid-layout", "blocking");
  }

  const non7777TestTokenSlug = `${FIXTURE_PREFIX}-non-7777-test-token`;
  writeVault(non7777TestTokenSlug, {
    manifest: baseManifest({
      match: {
        bindings: [{ chainId: 56, factoryAddress: FACTORY, tokenAddresses: [NON_7777_TOKEN] }],
      },
    }),
  });
  assertRule("manifest test tokens must end in 7777", runVaultCheck(non7777TestTokenSlug, { silent: true }), "manifest-binding/invalid-test-token-suffix", "blocking");

  const missingTestTokenSlug = `${FIXTURE_PREFIX}-missing-test-token`;
  writeVault(missingTestTokenSlug, {
    manifest: baseManifest({
      match: {
        bindings: [{ chainId: 56, factoryAddress: FACTORY }],
      },
    }),
  });
  assertRule("factory bindings must declare a manifest test token", runVaultCheck(missingTestTokenSlug, { silent: true }), "manifest-binding/missing-test-token", "blocking");

  const partialTestTokenSlug = `${FIXTURE_PREFIX}-partial-test-token`;
  writeVault(partialTestTokenSlug, {
    manifest: baseManifest({
      match: {
        bindings: [
          { chainId: 56, factoryAddress: FACTORY, tokenAddresses: [TOKEN] },
          { chainId: 97, factoryAddress: FACTORY },
        ],
      },
    }),
  });
  assertNoRule("one manifest test token can cover a multi-binding manifest", runVaultCheck(partialTestTokenSlug, { silent: true }), "manifest-binding/missing-test-token", "blocking");

  const invalidTxButtonStateSlug = `${FIXTURE_PREFIX}-invalid-tx-state`;
  writeVault(invalidTxButtonStateSlug, {
    component: `"use client";

import { useState } from "react";
import type { VaultComponentProps } from "@/src/sdk";
import { readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { Alert, StatusBadge, type TxButtonState } from "@/src/ui";

export default function SelftestVault(_props: VaultComponentProps) {
  const { context, i18n } = useFlapSdk();
  const host = readTaxVaultHostContext(context.host);
  const riskLevel = host.vaultInfo?.riskLevel ?? host.taxInfo?.vaultInfo?.riskLevel;
  const riskLabel = riskLevel === null ? i18n.t("risk.missing") : i18n.t("risk.ready");
  const riskTone = riskLevel === null ? "danger" : "neutral";
  const [txState, setTxState] = useState<TxButtonState>("idle");
  function run() {
    setTxState("pending");
    return txState;
  }
  return (
    <div>
      {riskLevel === null ? <Alert tone="danger">{i18n.t("risk.missing")}</Alert> : null}
      <StatusBadge tone={riskTone}>{riskLabel}</StatusBadge>
      <button onClick={run}>{i18n.t("title")}</button>
    </div>
  );
}
`,
    i18n: { en: { title: "Selftest", "risk.missing": "Risk unavailable", "risk.ready": "Risk ready" } },
  });
  assertRule("invalid TxButtonState setter values are blocked", runVaultCheck(invalidTxButtonStateSlug, { silent: true }), "ui/invalid-tx-button-state", "blocking");

  const placeholderTokenSlug = `${FIXTURE_PREFIX}-placeholder-token`;
  writeVault(placeholderTokenSlug, {
    manifest: baseManifest({
      match: {
        bindings: [{ chainId: 56, factoryAddress: FACTORY, tokenAddresses: [PLACEHOLDER_TOKEN] }],
      },
    }),
  });
  assertRule("template placeholder token bindings are blocked", runVaultCheck(placeholderTokenSlug, { silent: true }), "manifest-binding/placeholder-address", "blocking");

  assert.throws(() =>
    selectE2EBinding({
      match: {
        bindings: [{ chainId: 56, factoryAddress: FACTORY, tokenAddresses: [PLACEHOLDER_TOKEN] }],
      },
    }),
  );
  passed.push("vault:e2e selection rejects placeholder test tokens");

  assert.throws(() =>
    selectE2EBinding({
      match: {
        bindings: [{ chainId: 56, factoryAddress: FACTORY, tokenAddresses: [NON_7777_TOKEN] }],
      },
    }),
  );
  passed.push("vault:e2e selection rejects non-7777 test tokens");

  const invalidErc20TokenSlug = `${FIXTURE_PREFIX}-invalid-erc20-token`;
  createdFolderNames.push(invalidErc20TokenSlug);
  execFileSync(process.execPath, ["scripts/vault-scaffold.mjs", invalidErc20TokenSlug, "--chain", "56", "--factory", FACTORY, "--token", TOKEN, "--locales", "en"], {
    cwd: ROOT,
    stdio: "pipe",
  });
  const invalidErc20ManifestPath = path.join(ROOT, "src", "vaults", invalidErc20TokenSlug, "manifest.json");
  const invalidErc20Manifest = JSON.parse(fs.readFileSync(invalidErc20ManifestPath, "utf8"));
  invalidErc20Manifest.match.bindings[0].tokenAddresses = [NON_ERC20_TOKEN];
  fs.writeFileSync(invalidErc20ManifestPath, `${JSON.stringify(invalidErc20Manifest, null, 2)}\n`);
  assertRule(
    "vault:check blocks syntactically valid but undeployed ERC20 token addresses",
    await runVaultCheckWithTokenContracts(invalidErc20TokenSlug, { silent: true }),
    "manifest-binding/invalid-erc20-token",
    "blocking",
  );

  const shortLocaleSlug = `${FIXTURE_PREFIX}-short-locale`;
  writeVault(shortLocaleSlug, {
    manifest: baseManifest({ i18n: ["e", "en"] }),
    i18n: { e: { title: "Selftest" }, en: { title: "Selftest" } },
  });
  assertRule("single-character manifest locales are blocked like the JSON schema", runVaultCheck(shortLocaleSlug, { silent: true }), "i18n-policy/manifest-locales", "blocking");

  const vaultOnlySlug = `${FIXTURE_PREFIX}-vault-only`;
  writeVault(vaultOnlySlug, {
    manifest: baseManifest({
      match: {
        bindings: [{ chainId: 56, vaultAddresses: [VAULT], tokenAddresses: [TOKEN] }],
      },
    }),
  });
  const vaultOnlyCheck = runVaultCheck(vaultOnlySlug, { silent: true });
  assert.equal(vaultOnlyCheck.issues.some((item) => item.ruleId === "manifest-binding/missing-binding-target"), false);
  assert.equal(vaultOnlyCheck.issues.some((item) => item.ruleId === "manifest-binding/invalid-vault-address-list"), false);
  assert.equal(vaultOnlyCheck.issues.some((item) => item.ruleId === "manifest-binding/invalid-token-address-list"), false);
  passed.push("single-Vault bindings without factory are allowed");

  const zeroFactorySlug = `${FIXTURE_PREFIX}-zero-factory`;
  writeVault(zeroFactorySlug, {
    manifest: baseManifest({
      match: {
        bindings: [{ chainId: 56, factoryAddress: ZERO_ADDRESS }],
      },
    }),
  });
  assertRule("zero factory bindings are blocked", runVaultCheck(zeroFactorySlug, { silent: true }), "manifest-binding/zero-factory-address", "blocking");

  const placeholderFactorySlug = `${FIXTURE_PREFIX}-placeholder-factory`;
  writeVault(placeholderFactorySlug, {
    manifest: baseManifest({
      match: {
        bindings: [{ chainId: 56, factoryAddress: PLACEHOLDER_FACTORY }],
      },
    }),
  });
  assertRule("template placeholder factory bindings are blocked", runVaultCheck(placeholderFactorySlug, { silent: true }), "manifest-binding/placeholder-address", "blocking");

  const missingTargetSlug = `${FIXTURE_PREFIX}-missing-target`;
  writeVault(missingTargetSlug, {
    manifest: baseManifest({
      match: {
        bindings: [{ chainId: 56 }],
      },
    }),
  });
  assertRule("bindings without factory, Vault, or token target are blocked", runVaultCheck(missingTargetSlug, { silent: true }), "manifest-binding/missing-binding-target", "blocking");

  const tokenOnlySlug = `${FIXTURE_PREFIX}-token-only`;
  writeVault(tokenOnlySlug, {
    manifest: baseManifest({
      match: {
        bindings: [{ chainId: 56, tokenAddresses: [TOKEN, SECOND_TOKEN] }],
      },
    }),
  });
  const tokenOnlyCheck = runVaultCheck(tokenOnlySlug, { silent: true });
  assert.equal(tokenOnlyCheck.issues.some((item) => item.ruleId === "manifest-binding/missing-binding-target"), false);
  assert.equal(tokenOnlyCheck.issues.some((item) => item.ruleId === "manifest-binding/invalid-vault-address-list"), false);
  assert.equal(tokenOnlyCheck.issues.some((item) => item.ruleId === "manifest-binding/invalid-token-address-list"), false);
  passed.push("no-factory token-only bindings may contain multiple token addresses");

  const mixedTargetSlug = `${FIXTURE_PREFIX}-mixed-target`;
  writeVault(mixedTargetSlug, {
    manifest: baseManifest({
      match: {
        bindings: [{ chainId: 56, factoryAddress: FACTORY, vaultAddresses: [VAULT] }],
      },
    }),
  });
  assertRule("bindings cannot mix factory and Vault targets", runVaultCheck(mixedTargetSlug, { silent: true }), "manifest-binding/mixed-binding-target", "blocking");

  const mixedChainScopeSlug = `${FIXTURE_PREFIX}-mixed-chain-scope`;
  writeVault(mixedChainScopeSlug, {
    manifest: baseManifest({
      match: {
        bindings: [
          { chainId: 56, factoryAddress: FACTORY },
          { chainId: 56, tokenAddresses: [TOKEN] },
        ],
      },
    }),
  });
  assertRule("factory and no-factory bindings cannot share one chain", runVaultCheck(mixedChainScopeSlug, { silent: true }), "manifest-binding/mixed-chain-scope", "blocking");

  const duplicateBindingSlug = `${FIXTURE_PREFIX}-duplicate-binding`;
  writeVault(duplicateBindingSlug, {
    manifest: baseManifest({
      match: {
        bindings: [
          { chainId: 56, factoryAddress: FACTORY },
          { chainId: 56, factoryAddress: FACTORY.toLowerCase() },
        ],
      },
    }),
  });
  assertRule("duplicate chain and factory bindings are blocked", runVaultCheck(duplicateBindingSlug, { silent: true }), "manifest-binding/duplicate-binding", "blocking");

  const duplicateVaultBindingSlug = `${FIXTURE_PREFIX}-duplicate-vault-binding`;
  writeVault(duplicateVaultBindingSlug, {
    manifest: baseManifest({
      match: {
        bindings: [
          { chainId: 56, vaultAddresses: [VAULT] },
          { chainId: 56, vaultAddresses: [VAULT.toLowerCase()] },
        ],
      },
    }),
  });
  assertRule("duplicate chain and Vault bindings are blocked", runVaultCheck(duplicateVaultBindingSlug, { silent: true }), "manifest-binding/duplicate-binding", "blocking");

  const duplicateTokenOnlyBindingSlug = `${FIXTURE_PREFIX}-duplicate-token-binding`;
  writeVault(duplicateTokenOnlyBindingSlug, {
    manifest: baseManifest({
      match: {
        bindings: [
          { chainId: 56, tokenAddresses: [TOKEN] },
          { chainId: 56, tokenAddresses: [TOKEN.toLowerCase()] },
        ],
      },
    }),
  });
  assertRule("duplicate chain and token-only bindings are blocked", runVaultCheck(duplicateTokenOnlyBindingSlug, { silent: true }), "manifest-binding/duplicate-binding", "blocking");

  const duplicateAddressSlug = `${FIXTURE_PREFIX}-duplicate-address`;
  writeVault(duplicateAddressSlug, {
    manifest: baseManifest({
      match: {
        bindings: [{ chainId: 56, factoryAddress: FACTORY, tokenAddresses: [TOKEN, TOKEN.toLowerCase()] }],
      },
    }),
  });
  assertRule("duplicate binding-scoped addresses are blocked", runVaultCheck(duplicateAddressSlug, { silent: true }), "manifest-binding/duplicate-address", "blocking");

  const multiTokenVaultSlug = `${FIXTURE_PREFIX}-multi-token-vault`;
  writeVault(multiTokenVaultSlug, {
    manifest: baseManifest({
      match: {
        bindings: [{ chainId: 56, vaultAddresses: [VAULT], tokenAddresses: [TOKEN, SECOND_TOKEN] }],
      },
    }),
  });
  const multiTokenVaultCheck = runVaultCheck(multiTokenVaultSlug, { silent: true });
  assert.equal(multiTokenVaultCheck.issues.some((item) => item.ruleId === "manifest-binding/invalid-token-address-list"), false);
  passed.push("no-factory single-Vault bindings may contain multiple token addresses");

  const externalContractManifestSlug = `${FIXTURE_PREFIX}-external-contract-manifest`;
  writeVault(externalContractManifestSlug, {
    manifest: baseManifest({
      match: {
        bindings: [
          {
            chainId: 56,
            factoryAddress: FACTORY,
            externalContracts: [{ address: EXTERNAL_CONTRACT, label: "Reward distributor" }],
          },
        ],
      },
    }),
  });
  const externalContractManifestCheck = runVaultCheck(externalContractManifestSlug, { silent: true });
  assert.equal(externalContractManifestCheck.issues.some((item) => item.ruleId === "manifest-binding/invalid-external-contract-list"), false);
  assert.equal(externalContractManifestCheck.issues.some((item) => item.ruleId === "manifest-binding/invalid-external-contract-entry"), false);
  passed.push("binding-level externalContracts declarations are allowed");

  const invalidExternalContractSlug = `${FIXTURE_PREFIX}-invalid-external-contract`;
  writeVault(invalidExternalContractSlug, {
    manifest: baseManifest({
      match: {
        bindings: [{ chainId: 56, factoryAddress: FACTORY, externalContracts: [{ address: EXTERNAL_CONTRACT }] }],
      },
    }),
  });
  assertRule("external contract declarations require labels", runVaultCheck(invalidExternalContractSlug, { silent: true }), "manifest-binding/invalid-external-contract-entry", "blocking");

  const globalTokenPolicySlug = `${FIXTURE_PREFIX}-global-token-policy`;
  writeVault(globalTokenPolicySlug, {
    manifest: baseManifest({
      tokenAddresses: [TOKEN],
    }),
  });
  assertRule(
    "global tokenAddresses remain blocked",
    runVaultCheck(globalTokenPolicySlug, { silent: true }),
    "manifest-binding/ca-policy-not-in-manifest",
    "blocking",
  );

  const endpointSlug = `${FIXTURE_PREFIX}-endpoint`;
  writeVault(endpointSlug, {
    manifest: baseManifest({
      endpoints: { endpoint: "https://api.example.com/proof" },
    }),
  });
  assertRule("endpoint declarations must be string or string[]", runVaultCheck(endpointSlug, { silent: true }), "endpoint-policy/invalid-endpoints", "blocking");

  const endpointHttpsSlug = `${FIXTURE_PREFIX}-endpoint-http`;
  writeVault(endpointHttpsSlug, {
    manifest: baseManifest({
      endpoints: "http://api.example.com/proof",
    }),
  });
  assertRule("endpoint declarations must still be https", runVaultCheck(endpointHttpsSlug, { silent: true }), "endpoint-policy/https-required", "blocking");

  const endpointCredentialSlug = `${FIXTURE_PREFIX}-endpoint-credential`;
  writeVault(endpointCredentialSlug, {
    manifest: baseManifest({
      endpoints: "https://user:pass@api.example.com/proof",
    }),
  });
  assertRule("endpoint declarations must not include credentials", runVaultCheck(endpointCredentialSlug, { silent: true }), "endpoint-policy/no-credentials", "blocking");

  const endpointPrefixSlug = `${FIXTURE_PREFIX}-endpoint-prefix`;
  writeVault(endpointPrefixSlug, {
    manifest: baseManifest({
      endpoints: "https://api.example.com/proof",
    }),
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  const endpoint = "https://api.example.com/proofish";
  void endpoint;
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  assertRule("endpoint declaration does not allow unsafe prefix matches", runVaultCheck(endpointPrefixSlug, { silent: true }), "endpoint-policy/undeclared-url", "blocking");

  const commentedUrlSlug = `${FIXTURE_PREFIX}-commented-url`;
  writeVault(commentedUrlSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

// See https://docs.viem.sh for reference only.
/* Reference URL: https://api.example.com/commented */
export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  assertNoRule("comment-only URLs do not require manifest endpoint declarations", runVaultCheck(commentedUrlSlug, { silent: true }), "endpoint-policy/undeclared-url", "blocking");

  const allowedIpfsImageSlug = `${FIXTURE_PREFIX}-ipfs-image`;
  writeVault(allowedIpfsImageSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";
import { IpfsImage } from "@/src/ui";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  return (
    <div>
      <IpfsImage cid="bafkreicllrojftwdwi7gukkpydxkimru55isnrngj5ggyuy2zbbqvmfyiq" alt="" />
      {i18n.t("title")}
    </div>
  );
}
`,
  });
  const allowedIpfsImageCheck = runVaultCheck(allowedIpfsImageSlug, { silent: true });
  assertNoRule("IpfsImage CIDs do not require endpoint declarations", allowedIpfsImageCheck, "endpoint-policy/undeclared-url", "blocking");
  assertNoRule("IpfsImage CIDs are not remote-media violations", allowedIpfsImageCheck, "media-policy/remote-media", "blocking");
  assertNoRule("valid IpfsImage CIDs pass static CID validation", allowedIpfsImageCheck, "media-policy/invalid-ipfs-image-cid", "blocking");

  const allowedIpfsBackgroundSlug = `${FIXTURE_PREFIX}-ipfs-background`;
  writeVault(allowedIpfsBackgroundSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";
import { IpfsBackground } from "@/src/ui";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  return (
    <div className="relative">
      <IpfsBackground cid="bafkreicllrojftwdwi7gukkpydxkimru55isnrngj5ggyuy2zbbqvmfyiq" />
      {i18n.t("title")}
    </div>
  );
}
`,
  });
  const allowedIpfsBackgroundCheck = runVaultCheck(allowedIpfsBackgroundSlug, { silent: true });
  assertNoRule("IpfsBackground CIDs do not require endpoint declarations", allowedIpfsBackgroundCheck, "endpoint-policy/undeclared-url", "blocking");
  assertNoRule("IpfsBackground CIDs are not remote-media violations", allowedIpfsBackgroundCheck, "media-policy/remote-media", "blocking");
  assertNoRule("valid IpfsBackground CIDs pass static CID validation", allowedIpfsBackgroundCheck, "media-policy/invalid-ipfs-image-cid", "blocking");

  const invalidIpfsCidSlug = `${FIXTURE_PREFIX}-ipfs-image-invalid-cid`;
  writeVault(invalidIpfsCidSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";
import { IpfsImage } from "@/src/ui";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  return (
    <div>
      <IpfsImage cid="https://flap.mypinata.cloud/ipfs/bafkreicllrojftwdwi7gukkpydxkimru55isnrngj5ggyuy2zbbqvmfyiq" alt="" />
      {i18n.t("title")}
    </div>
  );
}
`,
  });
  assertRule("IpfsImage rejects URL values in cid", runVaultCheck(invalidIpfsCidSlug, { silent: true }), "media-policy/invalid-ipfs-image-cid", "blocking");

  const directIpfsImageUrlSlug = `${FIXTURE_PREFIX}-ipfs-image-direct-url`;
  writeVault(directIpfsImageUrlSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  return (
    <div>
      <img src="https://flap.mypinata.cloud/ipfs/bafkreicllrojftwdwi7gukkpydxkimru55isnrngj5ggyuy2zbbqvmfyiq" alt="" />
      {i18n.t("title")}
    </div>
  );
}
`,
  });
  assertRule("direct Flap gateway image URLs remain blocked", runVaultCheck(directIpfsImageUrlSlug, { silent: true }), "media-policy/remote-media", "blocking");

  const externalResourceSlug = `${FIXTURE_PREFIX}-external`;
  writeVault(externalResourceSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  const hiddenResource = "ipfs://bafybeigdyrzt/example.json";
  void hiddenResource;
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  assertRule("ipfs resources are not allowed to bypass endpoint checks", runVaultCheck(externalResourceSlug, { silent: true }), "endpoint-policy/undeclared-url", "blocking");

  const relativeFetchSlug = `${FIXTURE_PREFIX}-relative`;
  writeVault(relativeFetchSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  void fetch("/api/private");
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  assertRule("host-relative fetch is blocked", runVaultCheck(relativeFetchSlug, { silent: true }), "endpoint-policy/relative-endpoint", "blocking");

  const dynamicFetchSlug = `${FIXTURE_PREFIX}-dynamic-fetch`;
  writeVault(dynamicFetchSlug, {
    manifest: baseManifest({
      endpoints: "https://api.example.com/proof",
    }),
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  const endpoint = "https://api.example.com/proof";
  void fetch(endpoint);
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  assertRule("dynamic fetch targets are blocked", runVaultCheck(dynamicFetchSlug, { silent: true }), "endpoint-policy/direct-fetch", "blocking");

  const credentialedFetchSlug = `${FIXTURE_PREFIX}-credentialed-fetch`;
  writeVault(credentialedFetchSlug, {
    manifest: baseManifest({
      endpoints: "https://api.example.com/proof",
    }),
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  void fetch("https://user:pass@api.example.com/proof");
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  assertRule("credentialed fetch targets are blocked", runVaultCheck(credentialedFetchSlug, { silent: true }), "endpoint-policy/direct-fetch", "blocking");

  const declaredFetchSlug = `${FIXTURE_PREFIX}-declared-fetch`;
  writeVault(declaredFetchSlug, {
    manifest: baseManifest({
      endpoints: "https://api.example.com/proof",
    }),
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  void fetch("https://api.example.com/proof/details?symbol=QQQ&window=1d");
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  const declaredFetchCheck = runVaultCheck(declaredFetchSlug, { silent: true });
  assert.equal(declaredFetchCheck.issues.some((item) => item.ruleId === "endpoint-policy/direct-fetch"), false);
  assert.ok(
    declaredFetchCheck.review?.externalEndpoints?.some((item) => item.source === "fetch" && item.url === "https://api.example.com/proof/details?symbol=QQQ&window=1d" && item.queryParams?.symbol === "QQQ"),
    "declared fetch review output includes exact URL and query params",
  );
  passed.push("declared static HTTPS fetch child paths are allowed for review");
  passed.push("declared fetch review output includes exact URL and query params");

  const validFrameSlug = `${FIXTURE_PREFIX}-valid-frame`;
  writeVault(validFrameSlug, {
    manifest: baseManifest({
      externalFrames: [
        {
          id: "nvidia-chart",
          provider: "tradingview",
          src: TRADINGVIEW_FRAME_SRC,
          title: "TradingView NVDA chart",
        },
      ],
    }),
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";
import { ReviewedFrame } from "@/src/ui";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  return (
    <div>
      <ReviewedFrame
        frameId="nvidia-chart"
        provider="tradingview"
        src="${TRADINGVIEW_FRAME_SRC}"
        title="TradingView NVDA chart"
      />
      <span>{i18n.t("title")}</span>
    </div>
  );
}
`,
  });
  const validFrameCheck = runVaultCheck(validFrameSlug, { silent: true });
  assert.equal(
    validFrameCheck.issues.some((item) => item.severity === "blocking" && item.ruleId.startsWith("frame-policy/")),
    false,
  );
  assertNoRule("declared frame URL is not treated as an undeclared endpoint", validFrameCheck, "endpoint-policy/undeclared-url", "blocking");
  assertRule("declared external frames require manual review", validFrameCheck, "manual-review/external-frame", "warning");
  const validFrameWarning = validFrameCheck.issues.find((item) => item.ruleId === "manual-review/external-frame");
  assert.equal(validFrameWarning?.src, TRADINGVIEW_FRAME_SRC);
  assert.ok(validFrameWarning?.message.includes(TRADINGVIEW_FRAME_SRC));
  assert.deepEqual(validFrameCheck.review.externalFrames, [
    {
      frameId: "nvidia-chart",
      provider: "tradingview",
      src: TRADINGVIEW_FRAME_SRC,
      title: "TradingView NVDA chart",
      field: "externalFrames[0]",
      severity: "warning",
      ruleId: "manual-review/external-frame",
    },
  ]);
  passed.push("external frame review output prints the iframe src for Workbench review");

  const tooManyFrameDeclarationsSlug = `${FIXTURE_PREFIX}-too-many-frame-declarations`;
  writeVault(tooManyFrameDeclarationsSlug, {
    manifest: baseManifest({
      externalFrames: [
        {
          id: "nvidia-chart",
          provider: "tradingview",
          src: TRADINGVIEW_FRAME_SRC,
          title: "TradingView NVDA chart",
        },
        {
          id: "dex-chart",
          provider: "dexscreener",
          src: DEXSCREENER_FRAME_SRC,
          title: "DexScreener chart",
        },
      ],
    }),
  });
  assertRule("external frame declarations are limited to one per Vault UI", runVaultCheck(tooManyFrameDeclarationsSlug, { silent: true }), "frame-policy/too-many-reviewed-frames", "blocking");

  const tooManyReviewedFrameUsageSlug = `${FIXTURE_PREFIX}-too-many-reviewed-frames`;
  writeVault(tooManyReviewedFrameUsageSlug, {
    manifest: baseManifest({
      externalFrames: [
        {
          id: "nvidia-chart",
          provider: "tradingview",
          src: TRADINGVIEW_FRAME_SRC,
          title: "TradingView NVDA chart",
        },
      ],
    }),
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";
import { ReviewedFrame } from "@/src/ui";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  return (
    <div>
      <ReviewedFrame frameId="nvidia-chart" provider="tradingview" src="${TRADINGVIEW_FRAME_SRC}" title="TradingView NVDA chart" />
      <ReviewedFrame frameId="nvidia-chart" provider="tradingview" src="${TRADINGVIEW_FRAME_SRC}" title="TradingView NVDA chart" />
      <span>{i18n.t("title")}</span>
    </div>
  );
}
`,
  });
  assertRule("ReviewedFrame usage is limited to one per Vault UI", runVaultCheck(tooManyReviewedFrameUsageSlug, { silent: true }), "frame-policy/too-many-reviewed-frames", "blocking");

  const unsupportedFrameOriginSlug = `${FIXTURE_PREFIX}-bad-frame-origin`;
  writeVault(unsupportedFrameOriginSlug, {
    manifest: baseManifest({
      externalFrames: [
        {
          id: "bad-chart",
          provider: "tradingview",
          src: "https://evil.example.com/widget/?symbol=NASDAQ%3ANVDA",
          title: "Bad chart",
        },
      ],
    }),
  });
  assertRule("external frame origins are provider-scoped", runVaultCheck(unsupportedFrameOriginSlug, { silent: true }), "frame-policy/unsupported-origin", "blocking");

  const unsupportedFrameProviderSlug = `${FIXTURE_PREFIX}-bad-frame-provider`;
  writeVault(unsupportedFrameProviderSlug, {
    manifest: baseManifest({
      externalFrames: [
        {
          id: "bad-chart",
          provider: "unknown-provider",
          src: TRADINGVIEW_FRAME_SRC,
          title: "Bad chart",
        },
      ],
    }),
  });
  assertRule("external frame providers are fixed", runVaultCheck(unsupportedFrameProviderSlug, { silent: true }), "frame-policy/unsupported-provider", "blocking");

  const frameQuerySlug = `${FIXTURE_PREFIX}-frame-no-query`;
  writeVault(frameQuerySlug, {
    manifest: baseManifest({
      externalFrames: [
        {
          id: "queryless-chart",
          provider: "tradingview",
          src: "https://s.tradingview.com/widgetembed/",
          title: "Queryless chart",
        },
      ],
    }),
  });
  assertRule("external frame declarations require fixed query strings", runVaultCheck(frameQuerySlug, { silent: true }), "frame-policy/fixed-query-required", "blocking");

  const dynamicFrameSlug = `${FIXTURE_PREFIX}-dynamic-frame`;
  writeVault(dynamicFrameSlug, {
    manifest: baseManifest({
      externalFrames: [
        {
          id: "nvidia-chart",
          provider: "tradingview",
          src: TRADINGVIEW_FRAME_SRC,
          title: "TradingView NVDA chart",
        },
      ],
    }),
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";
import { ReviewedFrame } from "@/src/ui";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  void i18n;
  const chartSrc = "${TRADINGVIEW_FRAME_SRC}";
  return <ReviewedFrame frameId="nvidia-chart" provider="tradingview" src={chartSrc} title="TradingView NVDA chart" />;
}
`,
  });
  const dynamicFrameCheck = runVaultCheck(dynamicFrameSlug, { silent: true });
  assertRule("ReviewedFrame blocks dynamic src values", dynamicFrameCheck, "frame-policy/dynamic-frame-src", "blocking");

  const undeclaredFrameSlug = `${FIXTURE_PREFIX}-undeclared-frame`;
  writeVault(undeclaredFrameSlug, {
    manifest: baseManifest({
      externalFrames: [
        {
          id: "nvidia-chart",
          provider: "tradingview",
          src: TRADINGVIEW_FRAME_SRC,
          title: "TradingView NVDA chart",
        },
      ],
    }),
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";
import { ReviewedFrame } from "@/src/ui";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  return <ReviewedFrame frameId="nvidia-chart" provider="tradingview" src="https://s.tradingview.com/widgetembed/?symbol=NASDAQ%3ANVDA&interval=1&theme=dark&style=1" title="TradingView NVDA chart" />;
}
`,
  });
  assertRule("ReviewedFrame src must exactly match manifest.externalFrames", runVaultCheck(undeclaredFrameSlug, { silent: true }), "frame-policy/undeclared-frame-src", "blocking");

  const frameSrcDocSlug = `${FIXTURE_PREFIX}-frame-srcdoc`;
  writeVault(frameSrcDocSlug, {
    manifest: baseManifest({
      externalFrames: [
        {
          id: "nvidia-chart",
          provider: "tradingview",
          src: TRADINGVIEW_FRAME_SRC,
          title: "TradingView NVDA chart",
        },
      ],
    }),
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";
import { ReviewedFrame } from "@/src/ui";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  return <ReviewedFrame frameId="nvidia-chart" provider="tradingview" src="${TRADINGVIEW_FRAME_SRC}" title="TradingView NVDA chart" srcDoc={i18n.t("title")} />;
}
`,
  });
  assertRule("ReviewedFrame srcDoc is blocked", runVaultCheck(frameSrcDocSlug, { silent: true }), "frame-policy/invalid-reviewed-frame-usage", "blocking");

  const rawIframeSlug = `${FIXTURE_PREFIX}-raw-iframe`;
  writeVault(rawIframeSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  return <iframe src="${TRADINGVIEW_FRAME_SRC}" title={i18n.t("title")} />;
}
`,
  });
  assertRule("raw iframe remains blocked", runVaultCheck(rawIframeSlug, { silent: true }), "forbidden-api/iframe", "blocking");

  const safeInlineSvgSlug = `${FIXTURE_PREFIX}-safe-inline-svg`;
  writeVault(safeInlineSvgSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  return (
    <div aria-label={i18n.t("title")}>
      <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="card-gradient" x1="0" y1="0" x2="24" y2="24">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>
        <rect x="3" y="4" width="18" height="16" rx="3" fill="url(#card-gradient)" />
        <circle cx="8" cy="12" r="2" fill="#ffffff" />
        <path d="M12 9h6M12 13h4" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
`,
  });
  assertNoRule("safe pure inline SVG JSX is allowed", runVaultCheck(safeInlineSvgSlug, { silent: true }), "svg-policy/unsafe-inline-svg", "blocking");

  const unsafeSvgEventSlug = `${FIXTURE_PREFIX}-svg-event`;
  writeVault(unsafeSvgEventSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  return <svg viewBox="0 0 24 24" aria-label={i18n.t("title")} onLoad={() => undefined}><path d="M4 12h16" /></svg>;
}
`,
  });
  assertRule("inline SVG event attributes are blocked", runVaultCheck(unsafeSvgEventSlug, { silent: true }), "svg-policy/unsafe-inline-svg", "blocking");

  const unsafeSvgResourceSlug = `${FIXTURE_PREFIX}-svg-resource`;
  writeVault(unsafeSvgResourceSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  return (
    <svg viewBox="0 0 24 24" aria-label={i18n.t("title")}>
      <foreignObject width="24" height="24"><div>unsafe</div></foreignObject>
      <image href="https://evil.example/icon.png" width="24" height="24" />
      <use href="https://evil.example/sprite.svg#claim" />
    </svg>
  );
}
`,
  });
  assertRule("inline SVG foreignObject/image/use resource paths are blocked", runVaultCheck(unsafeSvgResourceSlug, { silent: true }), "svg-policy/unsafe-inline-svg", "blocking");

  const unsafeSvgStyleUrlSlug = `${FIXTURE_PREFIX}-svg-style-url`;
  writeVault(unsafeSvgStyleUrlSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  return <svg viewBox="0 0 24 24" aria-label={i18n.t("title")}><path d="M4 12h16" style={{ fill: "url(https://evil.example/icon.svg#x)" }} /></svg>;
}
`,
  });
  assertRule("inline SVG style url() is blocked", runVaultCheck(unsafeSvgStyleUrlSlug, { silent: true }), "svg-policy/unsafe-inline-svg", "blocking");

  const requireSlug = `${FIXTURE_PREFIX}-require`;
  writeVault(requireSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  void require("./VaultABI");
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  assertRule("CommonJS require is blocked", runVaultCheck(requireSlug, { silent: true }), "imports-and-dependencies/require-call", "blocking");

  const browserEscapeSlug = `${FIXTURE_PREFIX}-browser-escape`;
  writeVault(browserEscapeSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  const fetchRef = window["fetch"];
  localStorage.setItem("x", "y");
  new WebSocket("wss://example.com/socket");
  window.location.assign("https://evil.example.com");
  new Worker("worker.js");
  new BroadcastChannel("x");
  void navigator.clipboard;
  void fetchRef;
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  const browserEscapeCheck = runVaultCheck(browserEscapeSlug, { silent: true });
  assertRule("computed browser-global access is blocked", browserEscapeCheck, "forbidden-api/browser-global-escape", "blocking");
  assertRule("browser storage APIs are blocked", browserEscapeCheck, "forbidden-api/browser-storage", "blocking");
  assertRule("browser network APIs are blocked", browserEscapeCheck, "forbidden-api/browser-network", "blocking");
  assertRule("browser navigation APIs are blocked", browserEscapeCheck, "forbidden-api/browser-navigation", "blocking");
  assertRule("browser worker APIs are blocked", browserEscapeCheck, "forbidden-api/browser-worker", "blocking");
  assertRule("cross-context messaging APIs are blocked", browserEscapeCheck, "forbidden-api/cross-context-messaging", "blocking");
  assertRule("browser permission APIs are blocked", browserEscapeCheck, "forbidden-api/browser-permission", "blocking");

  const explorerWindowOpenSlug = `${FIXTURE_PREFIX}-explorer-window-open`;
  writeVault(explorerWindowOpenSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { context, i18n } = useFlapSdk();
  window.open(\`\${context.explorerBaseUrl}/address/\${context.vaultAddress}\`, "_blank", "noopener,noreferrer");
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  assertNoRule("window.open is allowed for context explorer address links with opener protection", runVaultCheck(explorerWindowOpenSlug, { silent: true }), "forbidden-api/browser-navigation", "blocking");

  const unsafeWindowOpenSlug = `${FIXTURE_PREFIX}-unsafe-window-open`;
  writeVault(unsafeWindowOpenSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  open("https://evil.example.com/claim");
  window.open("https://evil.example.com/claim", "_blank");
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  assertRule("global open and non-explorer window.open are blocked", runVaultCheck(unsafeWindowOpenSlug, { silent: true }), "forbidden-api/browser-navigation", "blocking");

  const walletBypassSlug = `${FIXTURE_PREFIX}-wallet-bypass`;
  writeVault(walletBypassSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";
import { createWalletClient, custom } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  const provider = web3.currentProvider;
  void ethereum.request({ method: "personal_sign", params: [] });
  void window.BinanceChain.request({ method: "eth_sendTransaction", params: [] });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  void provider;
  void createWalletClient;
  void custom;
  void privateKeyToAccount;
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  const walletBypassCheck = runVaultCheck(walletBypassSlug, { silent: true });
  assertRule("injected wallet providers and signing/transaction RPC methods are blocked", walletBypassCheck, "forbidden-api/direct-window-ethereum", "blocking");
  assertRule("wallet-client and account signing utilities are blocked", walletBypassCheck, "imports-and-dependencies/forbidden-import", "blocking");

  const evalEscapeSlug = `${FIXTURE_PREFIX}-eval-escape`;
  writeVault(evalEscapeSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  setTimeout("alert(1)", 0);
  const fn = (async () => undefined).constructor("return globalThis");
  void fn;
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  const evalEscapeCheck = runVaultCheck(evalEscapeSlug, { silent: true });
  assertRule("string timers are blocked as eval-like execution", evalEscapeCheck, "forbidden-api/eval", "blocking");
  assertRule("constructor-based scope escapes are blocked", evalEscapeCheck, "forbidden-api/function-constructor", "blocking");

  const domOverwriteSlug = `${FIXTURE_PREFIX}-dom-overwrite`;
  writeVault(domOverwriteSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  document.open();
  document.body.innerHTML = "<h1>Claim</h1>";
  document.close();
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  const domOverwriteCheck = runVaultCheck(domOverwriteSlug, { silent: true });
  assertRule("document open and direct HTML replacement are blocked", domOverwriteCheck, "forbidden-api/script", "blocking");
  assertRule("direct document access is blocked as browser-global escape", domOverwriteCheck, "forbidden-api/browser-global-escape", "blocking");

  const documentWriteSlug = `${FIXTURE_PREFIX}-document-write`;
  writeVault(documentWriteSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  document.writeln("<div>unsafe</div>");
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  assertRule("document.write and document.writeln are blocked as script injection", runVaultCheck(documentWriteSlug, { silent: true }), "forbidden-api/script", "blocking");

  const messageListenerSlug = `${FIXTURE_PREFIX}-message-listener`;
  writeVault(messageListenerSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  window.addEventListener("message", () => undefined);
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  assertRule("postMessage listeners are blocked", runVaultCheck(messageListenerSlug, { silent: true }), "forbidden-api/cross-context-messaging", "blocking");

  const symlinkSlug = `${FIXTURE_PREFIX}-symlink`;
  writeVault(symlinkSlug);
  fs.symlinkSync("Component.tsx", path.join(ROOT, "src", "vaults", symlinkSlug, "Alias.tsx"));
  assertRule("symlinks inside Vault folders are blocked", runVaultCheck(symlinkSlug, { silent: true }), "forbidden-files/symlink", "blocking");

  const sdkImportSlug = `${FIXTURE_PREFIX}-sdk-import`;
  writeVault(sdkImportSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";
import { createSdk } from "@partner/runtime-sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  void createSdk;
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  assertRule("external sdk packages are blocked", runVaultCheck(sdkImportSlug, { silent: true }), "imports-and-dependencies/external-sdk-package", "blocking");

  const deepSharedImportSlug = `${FIXTURE_PREFIX}-deep-runtime-import`;
  writeVault(deepSharedImportSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";
import { formatTokenAmount } from "@/src/sdk/format";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  void formatTokenAmount;
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  assertRule("shared runtime deep imports are blocked before Workbench build", runVaultCheck(deepSharedImportSlug, { silent: true }), "imports-and-dependencies/deep-shared-runtime-import", "blocking");

  const unreviewedImportSlug = `${FIXTURE_PREFIX}-unreviewed-import`;
  writeVault(unreviewedImportSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";
import { format } from "date-fns";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  void format;
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  assertRule("unreviewed imports are blocking to match Workbench intake", runVaultCheck(unreviewedImportSlug, { silent: true }), "imports-and-dependencies/unreviewed-import", "blocking");

  const dynamicImportSlug = `${FIXTURE_PREFIX}-dynamic-import`;
  writeVault(dynamicImportSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  const moduleName = "./VaultABI";
  void import(moduleName);
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  assertRule("dynamic imports with expression specifiers are blocked", runVaultCheck(dynamicImportSlug, { silent: true }), "imports-and-dependencies/dynamic-import", "blocking");

  const refetchMinimumSlug = `${FIXTURE_PREFIX}-refetch-minimum`;
  writeVault(refetchMinimumSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  const queryOptions = { refetchInterval: 5000 };
  void queryOptions;
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  assertNoRule("refetchInterval 5000ms is not treated as too fast", runVaultCheck(refetchMinimumSlug, { silent: true }), "performance/refetch-too-fast", "blocking");

  const refetchFastSlug = `${FIXTURE_PREFIX}-refetch-fast`;
  writeVault(refetchFastSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  const queryOptions = { refetchInterval: 4999 };
  void queryOptions;
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  assertRule("refetchInterval below 5000ms is blocked", runVaultCheck(refetchFastSlug, { silent: true }), "performance/refetch-too-fast", "blocking");

  const navigationSlug = `${FIXTURE_PREFIX}-navigation`;
  writeVault(navigationSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  return <a href="https://evil.example.com/claim">{i18n.t("title")}</a>;
}
`,
  });
  assertRule("arbitrary external navigation is blocked", runVaultCheck(navigationSlug, { silent: true }), "navigation-policy/unapproved-external-navigation", "blocking");

  const explorerNavigationSlug = `${FIXTURE_PREFIX}-explorer-navigation`;
  writeVault(explorerNavigationSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  return <a href="https://bscscan.com/address/0x55d398326f99059fF775485246999027B3197955">{i18n.t("title")}</a>;
}
`,
  });
  const explorerNavigationCheck = runVaultCheck(explorerNavigationSlug, { silent: true });
  assert.equal(explorerNavigationCheck.issues.some((item) => item.ruleId === "navigation-policy/unapproved-external-navigation"), false);
  assertRule("hardcoded explorer URLs are still undeclared external URLs", explorerNavigationCheck, "endpoint-policy/undeclared-url", "blocking");

  const contractBoundarySlug = `${FIXTURE_PREFIX}-contract-boundary`;
  writeVault(contractBoundarySlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  const routerAddress = "0x9000000000000000000000000000000000000009";
  void sdk.readContract({
    contract: "router",
    address: routerAddress,
    abi: [],
    functionName: "swapExactTokensForTokens",
  });
  return <div>{sdk.i18n.t("title")}</div>;
}
`,
  });
  const contractBoundaryCheck = runVaultCheck(contractBoundarySlug, { silent: true });
  assertRule("non-vault token nft contract labels are blocked", contractBoundaryCheck, "contract-boundary/disallowed-contract-label", "blocking");
  assertRule("undeclared fixed contract addresses are blocked", contractBoundaryCheck, "contract-boundary/undeclared-contract-address", "blocking");

  const operatorMethodSlug = `${FIXTURE_PREFIX}-operator-method`;
  writeVault(operatorMethodSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  void sdk.simulateContract({
    contract: "vault",
    address: sdk.context.vaultAddress,
    abi: [],
    functionName: "setSplit",
    args: [5000],
  });
  return <div>{sdk.i18n.t("title")}</div>;
}
`,
  });
  assertRule("operator config methods are blocked from Vault UI", runVaultCheck(operatorMethodSlug, { silent: true }), "contract-boundary/operator-method-exposed", "blocking");

  const vaultProxyActionSlug = `${FIXTURE_PREFIX}-vault-proxy-action`;
  writeVault(vaultProxyActionSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  void sdk.simulateContract({
    contract: "vault",
    address: sdk.context.vaultAddress,
    abi: [],
    functionName: "resolveDividend",
  });
  void sdk.simulateContract({
    contract: "vault",
    address: sdk.context.vaultAddress,
    abi: [],
    functionName: "swapAndDeposit",
  });
  return <div>{sdk.i18n.t("title")}</div>;
}
`,
  });
  assertNoRule("Vault user-facing proxy actions stay allowed", runVaultCheck(vaultProxyActionSlug, { silent: true }), "contract-boundary/operator-method-exposed", "blocking");

  const derivedTokenAddressSlug = `${FIXTURE_PREFIX}-derived-token-address`;
  writeVault(derivedTokenAddressSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { erc20Abi, useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  const subTokenAddress = "not-a-static-address" as unknown as \`0x\${string}\`;
  void sdk.readContract({
    contract: "token",
    address: subTokenAddress,
    abi: erc20Abi,
    functionName: "symbol",
  });
  return <div>{sdk.i18n.t("title")}</div>;
}
`,
  });
  assertRule("generic subTokenAddress sources are blocked like Workbench", runVaultCheck(derivedTokenAddressSlug, { silent: true }), "contract-boundary/undeclared-contract-address", "blocking");

  const contractEventMethodSlug = `${FIXTURE_PREFIX}-contract-event-methods`;
  writeVault(contractEventMethodSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";
import { createContractEventFilter, estimateContractGas, getLogs, watchContractEvent } from "viem";

export default function SelftestVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  const rogueLogAddress = "not-a-static-address" as unknown as \`0x\${string}\`;
  void watchContractEvent({ address: rogueLogAddress, abi: [], eventName: "Transfer" });
  void createContractEventFilter({ address: rogueLogAddress, abi: [], eventName: "Transfer" });
  void getLogs({ address: rogueLogAddress });
  void estimateContractGas({ address: rogueLogAddress, abi: [], functionName: "sync" });
  return <div>{sdk.i18n.t("title")}</div>;
}
`,
  });
  const contractEventMethodCheck = runVaultCheck(contractEventMethodSlug, { silent: true });
  for (const methodName of ["watchContractEvent", "createContractEventFilter", "getLogs", "estimateContractGas"]) {
    assert.ok(
      contractEventMethodCheck.issues.some((item) => item.ruleId === "contract-boundary/undeclared-contract-address" && item.message.startsWith(`${methodName} address source`)),
      `${methodName} address source should be checked`,
    );
  }
  passed.push("event, log, and gas contract methods are checked for address boundaries");

  const runtimeAddressKeywordSlug = `${FIXTURE_PREFIX}-runtime-address-keywords`;
  writeVault(runtimeAddressKeywordSlug, {
    component: `"use client";

import type { Address, VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  const feeVaultAddress = "not-a-static-address" as unknown as Address;
  const wrappedNativeToken = "not-a-static-address" as unknown as Address;
  const nativeToken = "not-a-static-address" as unknown as Address;
  const baseToken = "not-a-static-address" as unknown as Address;
  void sdk.readContract({ contract: "vault", address: feeVaultAddress, abi: [], functionName: "status" });
  void sdk.readContract({ contract: "token", address: wrappedNativeToken, abi: [], functionName: "symbol" });
  void sdk.readContract({ contract: "token", address: nativeToken, abi: [], functionName: "symbol" });
  void sdk.readContract({ contract: "token", address: baseToken, abi: [], functionName: "symbol" });
  return <div>{sdk.i18n.t("title")}</div>;
}
`,
  });
  assertNoRule("runtime fee/native/base token address variables are allowed", runVaultCheck(runtimeAddressKeywordSlug, { silent: true }), "contract-boundary/undeclared-contract-address", "blocking");

  const declaredExternalContractSlug = `${FIXTURE_PREFIX}-declared-external-contract`;
  writeVault(declaredExternalContractSlug, {
    manifest: baseManifest({
      match: {
        bindings: [
          {
            chainId: 56,
            factoryAddress: FACTORY,
            externalContracts: [{ address: EXTERNAL_CONTRACT, label: "Reward distributor" }],
          },
        ],
      },
    }),
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  const rewardDistributor = "${EXTERNAL_CONTRACT}" as const;
  void sdk.readContract({
    contract: "rewardDistributor",
    address: rewardDistributor,
    abi: [],
    functionName: "rewardRate",
  });
  return <div>{sdk.i18n.t("title")}</div>;
}
`,
  });
  const declaredExternalContractCheck = runVaultCheck(declaredExternalContractSlug, { silent: true });
  assert.equal(declaredExternalContractCheck.issues.some((item) => item.ruleId === "contract-boundary/undeclared-contract-address"), false);
  assert.equal(declaredExternalContractCheck.issues.some((item) => item.ruleId === "security/hardcoded-address"), false);
  assert.equal(declaredExternalContractCheck.issues.some((item) => item.ruleId === "contract-boundary/disallowed-contract-label"), false);
  passed.push("declared external contract addresses are allowed in SDK contract calls");

  const abiSlug = `${FIXTURE_PREFIX}-abi`;
  writeVault(abiSlug, {
    abi: `export const vaultAbi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;
`,
  });
  assertRule("standard ERC20 ABI names are blocked in VaultABI.ts", runVaultCheck(abiSlug, { silent: true }), "contract-abi/standard-erc20-in-vault-abi", "blocking");

  const humanReadableAbiSlug = `${FIXTURE_PREFIX}-human-readable-abi`;
  writeVault(humanReadableAbiSlug, {
    abi: `export const vaultAbi = [
  "function currentSeasonId() view returns (uint256)",
] as const;
`,
  });
  assertRule("human-readable ABI strings require parseAbi", runVaultCheck(humanReadableAbiSlug, { silent: true }), "contract-abi/human-readable-requires-parse-abi", "blocking");

  const parsedHumanReadableAbiSlug = `${FIXTURE_PREFIX}-parsed-human-readable-abi`;
  writeVault(parsedHumanReadableAbiSlug, {
    abi: `import { parseAbi } from "viem";

export const vaultAbi = parseAbi([
  "function currentSeasonId() view returns (uint256)",
]);
`,
  });
  const parsedHumanReadableAbiCheck = runVaultCheck(parsedHumanReadableAbiSlug, { silent: true });
  assert.equal(parsedHumanReadableAbiCheck.issues.some((item) => item.ruleId === "contract-abi/human-readable-requires-parse-abi"), false);
  passed.push("parseAbi-wrapped human-readable ABI strings are allowed");

  const multiOutputObjectReadSlug = `${FIXTURE_PREFIX}-multi-output-object-read`;
  writeVault(multiOutputObjectReadSlug, {
    abi: `import { parseAbi } from "viem";

export const vaultAbi = parseAbi([
  "function poolInfo() view returns (uint256 currentPool, uint256 totalReceived)",
]);
`,
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";
import { vaultAbi } from "./VaultABI";

interface PoolInfo {
  currentPool: bigint;
  totalReceived: bigint;
}

export default function SelftestVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  void sdk.readContract<PoolInfo>({
    contract: "vault",
    address: sdk.context.vaultAddress,
    abi: vaultAbi,
    functionName: "poolInfo",
  });
  return <div>{sdk.i18n.t("title")}</div>;
}
`,
  });
  assertRule(
    "multi-output contract reads must not use object result types",
    runVaultCheck(multiOutputObjectReadSlug, { silent: true }),
    "contract-abi/multiple-outputs-require-tuple-read",
    "blocking",
  );

  const multiOutputTupleReadSlug = `${FIXTURE_PREFIX}-multi-output-tuple-read`;
  writeVault(multiOutputTupleReadSlug, {
    abi: `import { parseAbi } from "viem";

export const vaultAbi = parseAbi([
  "function poolInfo() view returns (uint256 currentPool, uint256 totalReceived)",
]);
`,
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";
import { vaultAbi } from "./VaultABI";

type PoolInfoTuple = readonly [currentPool: bigint, totalReceived: bigint];

export default function SelftestVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  void sdk.readContract<PoolInfoTuple>({
    contract: "vault",
    address: sdk.context.vaultAddress,
    abi: vaultAbi,
    functionName: "poolInfo",
  });
  return <div>{sdk.i18n.t("title")}</div>;
}
`,
  });
  assertNoRule(
    "multi-output contract reads allow tuple result types",
    runVaultCheck(multiOutputTupleReadSlug, { silent: true }),
    "contract-abi/multiple-outputs-require-tuple-read",
    "blocking",
  );

  const singleTupleObjectReadSlug = `${FIXTURE_PREFIX}-single-tuple-object-read`;
  writeVault(singleTupleObjectReadSlug, {
    abi: `export const vaultAbi = [
  {
    type: "function",
    name: "poolInfo",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "currentPool", type: "uint256" },
          { name: "totalReceived", type: "uint256" },
        ],
      },
    ],
  },
] as const;
`,
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";
import { vaultAbi } from "./VaultABI";

interface PoolInfo {
  currentPool: bigint;
  totalReceived: bigint;
}

export default function SelftestVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  void sdk.readContract<PoolInfo>({
    contract: "vault",
    address: sdk.context.vaultAddress,
    abi: vaultAbi,
    functionName: "poolInfo",
  });
  return <div>{sdk.i18n.t("title")}</div>;
}
`,
  });
  assertNoRule(
    "single tuple object outputs may use object result types",
    runVaultCheck(singleTupleObjectReadSlug, { silent: true }),
    "contract-abi/multiple-outputs-require-tuple-read",
    "blocking",
  );

  const unprovisionedOracleSlug = `${FIXTURE_PREFIX}-oracle-block`;
  writeVault(unprovisionedOracleSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  void sdk.readOracle("pyth-qqq-latest-update", { feed: "qqq" });
  return <div>{sdk.i18n.t("title")}</div>;
}
`,
  });
  const unprovisionedOracleCheck = runVaultCheck(unprovisionedOracleSlug, { silent: true });
  assertRule("unprovisioned oracle ids block packaging", unprovisionedOracleCheck, "manual-review/oracle-usage", "blocking");
  assert.ok(
    unprovisionedOracleCheck.review?.oracles?.some((item) => item.oracleId === "pyth-qqq-latest-update" && item.provisioned === false && item.params?.feed === "qqq"),
    "unprovisioned oracle review output includes oracle id and params",
  );
  passed.push("unprovisioned oracle review output includes oracle id and params");

  const builtinOracleSlug = `${FIXTURE_PREFIX}-oracle-builtin`;
  writeVault(builtinOracleSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  void sdk.readOracle("example-reward-oracle");
  return <div>{sdk.i18n.t("title")}</div>;
}
`,
  });
  const builtinOracleCheck = runVaultCheck(builtinOracleSlug, { silent: true });
  assertNoRule("built-in runtime oracle ids do not block packaging", builtinOracleCheck, "manual-review/oracle-usage", "blocking");
  assertRule("built-in runtime oracle ids remain visible for manual review", builtinOracleCheck, "manual-review/oracle-usage", "warning");

  const officialPoolOracleSlug = `${FIXTURE_PREFIX}-oracle-v2-pool-reserves`;
  writeVault(officialPoolOracleSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  void sdk.readOracle("v2-pool-reserves", { pool: "0x0000000000000000000000000000000000007777" });
  return <div>{sdk.i18n.t("title")}</div>;
}
`,
  });
  const officialPoolOracleCheck = runVaultCheck(officialPoolOracleSlug, { silent: true });
  assertNoRule("official v2 pool reserves oracle id does not block packaging", officialPoolOracleCheck, "manual-review/oracle-usage", "blocking");
  assert.ok(
    officialPoolOracleCheck.review?.oracles?.some(
      (item) =>
        item.oracleId === "v2-pool-reserves" &&
        item.provisioned === true &&
        item.allowedParams?.includes("pool") &&
        item.endpoints?.includes("https://oracle-testnet.taxed.fun/v2-pool-reserves"),
    ),
    "official v2 pool reserves oracle review output includes endpoint and param policy",
  );
  passed.push("official v2 pool reserves oracle review output includes endpoint and param policy");

  const registryOracleSlug = `${FIXTURE_PREFIX}-oracle-registry`;
  writeVault(registryOracleSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  void sdk.readOracle("reviewed-settlement-oracle", { symbol: "QQQ" });
  return <div>{sdk.i18n.t("title")}</div>;
}
`,
  });
  const originalOracleRegistry = process.env.FLAP_RUNTIME_ORACLE_REGISTRY;
  process.env.FLAP_RUNTIME_ORACLE_REGISTRY = JSON.stringify({
    "reviewed-settlement-oracle": {
      endpoint: "https://oracle.example.com/settlement",
      allowedParams: ["symbol"],
      fixedParams: { feed: "qqq" },
    },
  });
  const registryOracleCheck = runVaultCheck(registryOracleSlug, { silent: true });
  assertRule("runtime registry-provisioned oracle ids block packaging", registryOracleCheck, "manual-review/oracle-usage", "blocking");
  assert.ok(
    registryOracleCheck.review?.oracles?.some((item) => item.oracleId === "reviewed-settlement-oracle" && item.endpoints?.includes("https://oracle.example.com/settlement") && item.allowedParams?.includes("symbol") && item.fixedParams?.feed === "qqq"),
    "registry oracle review output includes endpoint and param policy",
  );
  passed.push("registry oracle review output includes endpoint and param policy");

  const numberBigintSlug = `${FIXTURE_PREFIX}-number-bigint`;
  writeVault(numberBigintSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const { i18n } = useFlapSdk();
  const rewardAmount = 1n;
  const unsafeRewardAmount = Number(rewardAmount);
  return <div>{i18n.t("title")} {unsafeRewardAmount}</div>;
}
`,
  });
  assertRule("Number conversion for token amount math blocks packaging", runVaultCheck(numberBigintSlug, { silent: true }), "contract-abi/number-bigint", "blocking");
  process.env.FLAP_RUNTIME_ORACLE_REGISTRY = JSON.stringify({
    "reviewed-settlement-oracle": {
      endpoint: "https://oracle.example.com/settlement",
      headers: { Authorization: "Bearer example" },
      allowedParams: ["symbol"],
      fixedParams: { feed: "qqq" },
    },
  });
  const headerRegistryOracleCheck = runVaultCheck(registryOracleSlug, { silent: true });
  assertRule("runtime registry entries with headers do not provision oracle ids", headerRegistryOracleCheck, "manual-review/oracle-usage", "blocking");
  assert.ok(
    headerRegistryOracleCheck.review?.oracles?.some((item) => item.oracleId === "reviewed-settlement-oracle" && item.provisioned === false),
    "header-bearing registry oracle remains unprovisioned in review output",
  );
  if (originalOracleRegistry === undefined) {
    delete process.env.FLAP_RUNTIME_ORACLE_REGISTRY;
  } else {
    process.env.FLAP_RUNTIME_ORACLE_REGISTRY = originalOracleRegistry;
  }

  const stageGatingSlug = `${FIXTURE_PREFIX}-stage-gating`;
  writeVault(stageGatingSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";

export default function SelftestVault(_props: VaultComponentProps) {
  const sdk = useFlapSdk();
  const { i18n } = sdk;
  async function submit() {
    await sdk.writeContract({
      contract: "vault",
      address: sdk.context.vaultAddress,
      abi: [],
      functionName: "submit",
    });
  }
  void submit;
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  assertRule("write paths are blocked when market phase gating is missing", runVaultCheck(stageGatingSlug, { silent: true }), "manual-review/action-stage-gating", "blocking");

  const riskStatusSlug = `${FIXTURE_PREFIX}-risk-status`;
  writeVault(riskStatusSlug);
  assertRule("components must render host risk status", runVaultCheck(riskStatusSlug, { silent: true }), "risk-status/missing-host-risk-state", "blocking");

  const hardcodedVisibleCopySlug = `${FIXTURE_PREFIX}-hardcoded-copy`;
  writeVault(hardcodedVisibleCopySlug, {
    component: `"use client";

import type { Address, VaultComponentProps } from "@/src/sdk";
import { readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { Alert, StatusBadge } from "@/src/ui";

interface Snapshot {
  collectionName: string;
}

function formatReleaseTime(value?: bigint) {
  if (!value || value <= 0n) return "-";
  const diff = Math.max(0, Number(value) * 1000 - Date.now());
  if (diff <= 0) return "现在";
  const totalSeconds = Math.floor(diff / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return \`\${seconds}秒\`;
  return \`\${minutes}分\${seconds.toString().padStart(2, "0")}秒\`;
}

function makePreviewSnapshot(_contextTokenAddress: Address): Snapshot {
  return { collectionName: "凭证升级分红" };
}

export default function SelftestVault(_props: VaultComponentProps) {
  const { context, i18n } = useFlapSdk();
  const host = readTaxVaultHostContext(context.host);
  const riskLevel =
    host.vaultInfo?.riskLevel ??
    host.taxInfo?.vaultInfo?.riskLevel ??
    null;
  const riskLabel = riskLevel == null ? i18n.t("risk.missing") : String(riskLevel);
  void formatReleaseTime;
  void makePreviewSnapshot;
  return (
    <div>
      <StatusBadge tone={riskLevel === null ? "danger" : "success"}>{riskLabel}</StatusBadge>
      {riskLevel === null ? <Alert>{i18n.t("risk.missing")}</Alert> : null}
    </div>
  );
}
`,
    i18n: { en: { "risk.missing": "Risk status missing" } },
  });
  assertRule("Component.tsx hardcoded CJK visible copy is blocked", runVaultCheck(hardcodedVisibleCopySlug, { silent: true }), "i18n-policy/hardcoded-visible-copy", "blocking");

  const riskStatusSpoofSlug = `${FIXTURE_PREFIX}-risk-status-spoof`;
  writeVault(riskStatusSpoofSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { useFlapSdk } from "@/src/sdk";
import { Alert } from "@/src/ui";

export default function SelftestVault(_props: VaultComponentProps) {
  const { context, i18n } = useFlapSdk();
  const riskLevel = 1;
  void context.host;
  return <Alert>{i18n.t("title")}</Alert>;
}
`,
  });
  assertRule("risk status check is not satisfied by loose keyword mentions", runVaultCheck(riskStatusSpoofSlug, { silent: true }), "risk-status/missing-host-risk-state", "blocking");

  const riskStatusMissingWarningSlug = `${FIXTURE_PREFIX}-risk-status-no-warning`;
  writeVault(riskStatusMissingWarningSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { Alert, StatusBadge } from "@/src/ui";

export default function SelftestVault(_props: VaultComponentProps) {
  const { context } = useFlapSdk();
  const host = readTaxVaultHostContext(context.host);
  const riskLevel =
    host.vaultInfo?.riskLevel ??
    host.taxInfo?.vaultInfo?.riskLevel ??
    null;
  const riskLabel = String(riskLevel ?? "unknown");
  return (
    <div>
      <StatusBadge>{riskLabel}</StatusBadge>
      <Alert>{riskLabel}</Alert>
    </div>
  );
}
`,
  });
  assertRule("risk status integration must include an explicit missing-risk warning", runVaultCheck(riskStatusMissingWarningSlug, { silent: true }), "risk-status/missing-host-risk-state", "blocking");

  const riskStatusLooseSlug = `${FIXTURE_PREFIX}-risk-status-loose`;
  writeVault(riskStatusLooseSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { Alert, StatusBadge } from "@/src/ui";

export default function SelftestVault(_props: VaultComponentProps) {
  const { context, i18n } = useFlapSdk();
  const host = readTaxVaultHostContext(context.host);
  const riskLevel =
    host.vaultInfo?.riskLevel ??
    host.taxInfo?.vaultInfo?.riskLevel ??
    null;
  const isRiskUnknown = riskLevel == null;
  const riskLabel = isRiskUnknown ? i18n.t("title") : String(riskLevel);
  return (
    <div>
      <StatusBadge>{riskLabel}</StatusBadge>
      {isRiskUnknown && <Alert>{i18n.t("title")}</Alert>}
    </div>
  );
}
`,
  });
  assertNoRule("risk status integration accepts multiline risk derivation and boolean missing-risk guards", runVaultCheck(riskStatusLooseSlug, { silent: true }), "risk-status/missing-host-risk-state", "blocking");

  const manualLowRiskSlug = `${FIXTURE_PREFIX}-manual-low-risk`;
  writeVault(manualLowRiskSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { Alert, StatusBadge } from "@/src/ui";

export default function SelftestVault(_props: VaultComponentProps) {
  const { context, i18n } = useFlapSdk();
  const host = readTaxVaultHostContext(context.host);
  const riskLevel =
    host.vaultInfo?.riskLevel ??
    host.taxInfo?.vaultInfo?.riskLevel ??
    null;
  const riskLabel = riskLevel == null ? i18n.t("risk.missing") : String(riskLevel);
  return (
    <div>
      <StatusBadge>{riskLabel}</StatusBadge>
      {riskLevel === null ? <Alert>{i18n.t("risk.missing")}</Alert> : null}
      <StatusBadge>{i18n.t("risk.low")}</StatusBadge>
    </div>
  );
}
`,
    i18n: { en: { "risk.low": "Low risk", "risk.missing": "Risk status missing" } },
  });
  assertRule("manual low-risk labels are blocked even when host risk status is wired", runVaultCheck(manualLowRiskSlug, { silent: true }), "risk-status/manual-low-risk-label", "blocking");

  const hostDerivedLowRiskSlug = `${FIXTURE_PREFIX}-host-derived-low-risk`;
  writeVault(hostDerivedLowRiskSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { Alert, StatusBadge } from "@/src/ui";

export default function SelftestVault(_props: VaultComponentProps) {
  const { context, i18n } = useFlapSdk();
  const host = readTaxVaultHostContext(context.host);
  const riskLevel =
    host.vaultInfo?.riskLevel ??
    host.taxInfo?.vaultInfo?.riskLevel ??
    null;
  const riskLabel =
    riskLevel === 1
      ? i18n.t("risk.low")
      : riskLevel == null
        ? i18n.t("risk.missing")
        : String(riskLevel);
  return (
    <div>
      <StatusBadge>{riskLabel}</StatusBadge>
      {riskLevel === null ? <Alert>{i18n.t("risk.missing")}</Alert> : null}
    </div>
  );
}
`,
    i18n: { en: { "risk.low": "Low risk", "risk.missing": "Risk status missing" } },
  });
  assertNoRule("host-derived low-risk label is accepted", runVaultCheck(hostDerivedLowRiskSlug, { silent: true }), "risk-status/manual-low-risk-label", "blocking");

  const lateRiskStatusSlug = `${FIXTURE_PREFIX}-late-risk-status`;
  const lateRiskStatusFiller = Array.from({ length: 36 }, (_, index) => `      <div data-row="${index}">{i18n.t("risk.missing")}</div>`).join("\n");
  writeVault(lateRiskStatusSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { Alert, StatusBadge } from "@/src/ui";

export default function SelftestVault(_props: VaultComponentProps) {
  const { context, i18n } = useFlapSdk();
  const host = readTaxVaultHostContext(context.host);
  const riskLevel =
    host.vaultInfo?.riskLevel ??
    host.taxInfo?.vaultInfo?.riskLevel ??
    null;
  const riskLabel = riskLevel == null ? i18n.t("risk.missing") : String(riskLevel);
  return (
    <div>
${lateRiskStatusFiller}
      <StatusBadge>{riskLabel}</StatusBadge>
      {riskLevel === null ? <Alert>{i18n.t("risk.missing")}</Alert> : null}
    </div>
  );
}
`,
    i18n: { en: { "risk.missing": "Risk status missing" } },
  });
  assertRule("risk status must stay within the first three business UI rows", runVaultCheck(lateRiskStatusSlug, { silent: true }), "risk-status/not-prominent-placement", "blocking");

  const riskAfterPreviewSlug = `${FIXTURE_PREFIX}-risk-after-preview`;
  writeVault(riskAfterPreviewSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { Alert, StatusBadge } from "@/src/ui";

function ButterflyCardPreview() {
  return <div>{null}</div>;
}

export default function SelftestVault(_props: VaultComponentProps) {
  const { context, i18n } = useFlapSdk();
  const host = readTaxVaultHostContext(context.host);
  const riskLevel =
    host.vaultInfo?.riskLevel ??
    host.taxInfo?.vaultInfo?.riskLevel ??
    null;
  const riskLabel = riskLevel == null ? i18n.t("risk.missing") : String(riskLevel);
  return (
    <div>
      <ButterflyCardPreview />
      <StatusBadge tone={riskLevel === null ? "danger" : "success"}>{riskLabel}</StatusBadge>
      {riskLevel === null ? <Alert>{i18n.t("risk.missing")}</Alert> : null}
    </div>
  );
}
`,
    i18n: { en: { "risk.missing": "Risk status missing" } },
  });
  assertRule("risk status cannot be preceded by a preview or hero block", runVaultCheck(riskAfterPreviewSlug, { silent: true }), "risk-status/not-prominent-placement", "blocking");

  const riskAfterCanvasSlug = `${FIXTURE_PREFIX}-risk-after-canvas`;
  writeVault(riskAfterCanvasSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { Alert, StatusBadge } from "@/src/ui";

export default function SelftestVault(_props: VaultComponentProps) {
  const { context, i18n } = useFlapSdk();
  const host = readTaxVaultHostContext(context.host);
  const riskLevel =
    host.vaultInfo?.riskLevel ??
    host.taxInfo?.vaultInfo?.riskLevel ??
    null;
  const riskLabel = riskLevel == null ? i18n.t("risk.missing") : String(riskLevel);
  return (
    <div>
      <canvas width={320} height={160} />
      <StatusBadge tone={riskLevel === null ? "danger" : "success"}>{riskLabel}</StatusBadge>
      {riskLevel === null ? <Alert>{i18n.t("risk.missing")}</Alert> : null}
    </div>
  );
}
`,
    i18n: { en: { "risk.missing": "Risk status missing" } },
  });
  assertRule("risk status cannot be preceded by a canvas visual", runVaultCheck(riskAfterCanvasSlug, { silent: true }), "risk-status/not-prominent-placement", "blocking");

  const riskBeforeCanvasSlug = `${FIXTURE_PREFIX}-risk-before-canvas`;
  writeVault(riskBeforeCanvasSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { Alert, StatusBadge } from "@/src/ui";

export default function SelftestVault(_props: VaultComponentProps) {
  const { context, i18n } = useFlapSdk();
  const host = readTaxVaultHostContext(context.host);
  const riskLevel =
    host.vaultInfo?.riskLevel ??
    host.taxInfo?.vaultInfo?.riskLevel ??
    null;
  const riskLabel = riskLevel == null ? i18n.t("risk.missing") : String(riskLevel);
  return (
    <div>
      <StatusBadge tone={riskLevel === null ? "danger" : "success"}>{riskLabel}</StatusBadge>
      {riskLevel === null ? <Alert>{i18n.t("risk.missing")}</Alert> : null}
      <canvas width={320} height={160} />
    </div>
  );
}
`,
    i18n: { en: { "risk.missing": "Risk status missing" } },
  });
  assertNoRule("risk status before a canvas visual is accepted", runVaultCheck(riskBeforeCanvasSlug, { silent: true }), "risk-status/not-prominent-placement", "blocking");

  const riskAfterThreeRowsSlug = `${FIXTURE_PREFIX}-risk-after-three-rows`;
  writeVault(riskAfterThreeRowsSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { Alert, DetailTile, Metric, StatusBadge } from "@/src/ui";

export default function SelftestVault(_props: VaultComponentProps) {
  const { context, i18n } = useFlapSdk();
  const host = readTaxVaultHostContext(context.host);
  const riskLevel =
    host.vaultInfo?.riskLevel ??
    host.taxInfo?.vaultInfo?.riskLevel ??
    null;
  const riskLabel = riskLevel == null ? i18n.t("risk.missing") : String(riskLevel);
  return (
    <div>
      <StatusBadge>{i18n.t("state.ready")}</StatusBadge>
      <DetailTile label={i18n.t("labels.balance")} value="0" />
      <Metric label={i18n.t("labels.claimable")} value="0" />
      <StatusBadge tone={riskLevel === null ? "danger" : "success"}>{riskLabel}</StatusBadge>
      {riskLevel === null ? <Alert>{i18n.t("risk.missing")}</Alert> : null}
    </div>
  );
}
`,
    i18n: { en: { "labels.balance": "Balance", "labels.claimable": "Claimable", "risk.missing": "Risk status missing", "state.ready": "Ready" } },
  });
  assertRule("risk status cannot appear after the first three business UI rows", runVaultCheck(riskAfterThreeRowsSlug, { silent: true }), "risk-status/not-prominent-placement", "blocking");

  const riskThirdRowSlug = `${FIXTURE_PREFIX}-risk-third-row`;
  writeVault(riskThirdRowSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { Alert, DetailTile, StatusBadge } from "@/src/ui";

export default function SelftestVault(_props: VaultComponentProps) {
  const { context, i18n } = useFlapSdk();
  const host = readTaxVaultHostContext(context.host);
  const riskLevel =
    host.vaultInfo?.riskLevel ??
    host.taxInfo?.vaultInfo?.riskLevel ??
    null;
  const riskLabel = riskLevel == null ? i18n.t("risk.missing") : String(riskLevel);
  return (
    <div>
      <StatusBadge>{i18n.t("state.ready")}</StatusBadge>
      <DetailTile label={i18n.t("labels.balance")} value="0" />
      <StatusBadge tone={riskLevel === null ? "danger" : "success"}>{riskLabel}</StatusBadge>
      {riskLevel === null ? <Alert>{i18n.t("risk.missing")}</Alert> : null}
    </div>
  );
}
`,
    i18n: { en: { "labels.balance": "Balance", "risk.missing": "Risk status missing", "state.ready": "Ready" } },
  });
  assertNoRule("risk status in the third business UI row is accepted", runVaultCheck(riskThirdRowSlug, { silent: true }), "risk-status/not-prominent-placement", "blocking");

  execFileSync(process.execPath, ["scripts/vault-e2e.mjs"], {
    cwd: ROOT,
    env: { ...process.env, VAULT_E2E_CONSOLE_FILTER_SELFTEST: "1" },
    stdio: "pipe",
  });
  passed.push("vault:e2e console filter ignores transient network-changed resource errors only");

  const rowHeavyDashboardSlug = `${FIXTURE_PREFIX}-row-heavy-dashboard`;
  writeVault(rowHeavyDashboardSlug, {
    component: `"use client";

import type { VaultComponentProps } from "@/src/sdk";
import { readTaxVaultHostContext, useFlapSdk } from "@/src/sdk";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, DetailTile, Metric, StatusBadge } from "@/src/ui";

export default function SelftestVault(_props: VaultComponentProps) {
  const { context, i18n } = useFlapSdk();
  const host = readTaxVaultHostContext(context.host);
  const riskLevel =
    host.vaultInfo?.riskLevel ??
    host.taxInfo?.vaultInfo?.riskLevel ??
    null;
  const riskLabel = riskLevel == null ? i18n.t("risk.missing") : String(riskLevel);
  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>{i18n.t("title")}</CardTitle>
          <StatusBadge tone={riskLevel === null ? "danger" : "success"}>{riskLabel}</StatusBadge>
        </CardHeader>
        <CardContent>
          {riskLevel === null ? <Alert>{i18n.t("risk.missing")}</Alert> : null}
          <Metric label={i18n.t("labels.a")} value="1" />
          <Metric label={i18n.t("labels.b")} value="2" />
          <Metric label={i18n.t("labels.c")} value="3" />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <DetailTile label={i18n.t("labels.d")} value="4" />
          <DetailTile label={i18n.t("labels.e")} value="5" />
          <DetailTile label={i18n.t("labels.f")} value="6" />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <DetailTile label={i18n.t("labels.g")} value="7" />
          <DetailTile label={i18n.t("labels.h")} value="8" />
          <Button>{i18n.t("actions.submit")}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
`,
    i18n: {
      en: {
        "actions.submit": "Submit",
        "labels.a": "A",
        "labels.b": "B",
        "labels.c": "C",
        "labels.d": "D",
        "labels.e": "E",
        "labels.f": "F",
        "labels.g": "G",
        "labels.h": "H",
        "risk.missing": "Risk status missing",
        title: "Selftest",
      },
    },
  });
  assertRule("row-heavy dashboard layouts are blocked for new Vault UI", runVaultCheck(rowHeavyDashboardSlug, { silent: true }), "visual-policy/row-heavy-dashboard", "blocking");

  const scaffoldFlowSlug = `${FIXTURE_PREFIX}-flow`;
  assert.throws(() =>
    execFileSync(process.execPath, ["scripts/vault-scaffold.mjs", `${FIXTURE_PREFIX}-zero-scaffold`, "--chain", "56", "--factory", ZERO_ADDRESS, "--token", TOKEN, "--locales", "en"], {
      cwd: ROOT,
      stdio: "pipe",
    }),
  );
  passed.push("scaffold rejects zero factory input");

  assert.throws(() =>
    execFileSync(process.execPath, ["scripts/vault-scaffold.mjs", `${FIXTURE_PREFIX}-placeholder-scaffold`, "--chain", "56", "--factory", PLACEHOLDER_FACTORY, "--token", TOKEN, "--locales", "en"], {
      cwd: ROOT,
      stdio: "pipe",
    }),
  );
  passed.push("scaffold rejects template placeholder factory input");

  assert.throws(() =>
    execFileSync(process.execPath, ["scripts/vault-scaffold.mjs", `${FIXTURE_PREFIX}-placeholder-token-scaffold`, "--chain", "56", "--factory", FACTORY, "--token", PLACEHOLDER_TOKEN, "--locales", "en"], {
      cwd: ROOT,
      stdio: "pipe",
    }),
  );
  passed.push("scaffold rejects template placeholder token input");

  assert.throws(() =>
    execFileSync(process.execPath, ["scripts/vault-scaffold.mjs", `${FIXTURE_PREFIX}-non-7777-token-scaffold`, "--chain", "56", "--factory", FACTORY, "--token", NON_7777_TOKEN, "--locales", "en"], {
      cwd: ROOT,
      stdio: "pipe",
    }),
  );
  passed.push("scaffold rejects non-7777 test token input");

  assert.throws(() =>
    execFileSync(process.execPath, ["scripts/vault-scaffold.mjs", `${FIXTURE_PREFIX}-invalid-erc20-token-scaffold`, "--chain", "56", "--factory", FACTORY, "--token", NON_ERC20_TOKEN, "--locales", "en"], {
      cwd: ROOT,
      stdio: "pipe",
    }),
  );
  passed.push("scaffold rejects undeployed ERC20 token input");

  const partialTokenScaffoldSlug = `${FIXTURE_PREFIX}-partial-token-scaffold`;
  createdFolderNames.push(partialTokenScaffoldSlug);
  execFileSync(
    process.execPath,
    [
      "scripts/vault-scaffold.mjs",
      partialTokenScaffoldSlug,
      "--chain",
      "56",
      "--factory",
      FACTORY,
      "--token",
      TOKEN,
      "--chain",
      "97",
      "--factory",
      FACTORY,
      "--locales",
      "en",
    ],
    {
      cwd: ROOT,
      stdio: "pipe",
    },
  );
  passed.push("scaffold accepts one manifest test token for multiple bindings");

  const crlfRegisterSlug = `${FIXTURE_PREFIX}-crlf-register`;
  writeVault(crlfRegisterSlug);
  fs.writeFileSync(INDEX_PATH, fs.readFileSync(INDEX_PATH, "utf8").replace(/\r?\n/g, "\r\n"));
  const crlfRegisterOutput = execFileSync(process.execPath, ["scripts/vault-register.mjs", crlfRegisterSlug], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe",
  });
  const crlfRegisterReport = JSON.parse(crlfRegisterOutput);
  assert.equal(crlfRegisterReport.ok, true);
  assert.ok(fs.readFileSync(INDEX_PATH, "utf8").includes(`\r\n  "${crlfRegisterSlug}": {`));
  const crlfUnregisterOutput = execFileSync(process.execPath, ["scripts/vault-register.mjs", crlfRegisterSlug, "--remove"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe",
  });
  const crlfUnregisterReport = JSON.parse(crlfUnregisterOutput);
  assert.equal(crlfUnregisterReport.ok, true);
  assert.equal(crlfUnregisterReport.removed, true);
  assert.equal(fs.readFileSync(INDEX_PATH, "utf8").includes(`./${crlfRegisterSlug}/Component`), false);
  passed.push("vault:register supports CRLF index.ts files");

  createdFolderNames.push(scaffoldFlowSlug);
  createdPackagePaths.push(path.join(ROOT, "dist", `${scaffoldFlowSlug}.zip`));
  execFileSync(process.execPath, ["scripts/vault-scaffold.mjs", scaffoldFlowSlug, "--chain", "56", "--factory", FACTORY, "--token", TOKEN, "--locales", "en,zh"], {
    cwd: ROOT,
    stdio: "pipe",
  });
  assert.ok(fs.readFileSync(INDEX_PATH, "utf8").includes(`\n  "${scaffoldFlowSlug}": {`));
  passed.push("scaffold registration keeps each module entry on its own line");

  const scaffoldCheck = runVaultCheck(scaffoldFlowSlug, { silent: true });
  assert.equal(scaffoldCheck.summary.blocking, 0);
  passed.push("scaffolded package passes vault:check");

  writePassingE2EReport(scaffoldFlowSlug);
  passed.push("scaffolded package has a current E2E proof before packaging");

  const packageOutput = execFileSync(process.execPath, ["scripts/vault-package.mjs", scaffoldFlowSlug], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe",
  });
  const packageReport = JSON.parse(packageOutput);
  assert.equal(packageReport.ok, true);
  assert.equal(packageReport.folderName, scaffoldFlowSlug);
  passed.push("scaffolded package can be packaged");

  const verifyOutput = execFileSync(process.execPath, ["scripts/vault-verify-package.mjs", packageReport.sourcePackagePath], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe",
  });
  const verifyReport = JSON.parse(verifyOutput);
  assert.equal(verifyReport.ok, true);
  assert.equal(verifyReport.folderName, scaffoldFlowSlug);
  passed.push("scaffolded package verifies marker, file list, metadata, and hashes");

  const unregisterOutput = execFileSync(process.execPath, ["scripts/vault-register.mjs", scaffoldFlowSlug, "--remove"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe",
  });
  const unregisterReport = JSON.parse(unregisterOutput);
  assert.equal(unregisterReport.ok, true);
  assert.equal(unregisterReport.removed, true);
  assert.equal(fs.readFileSync(INDEX_PATH, "utf8").includes(`./${scaffoldFlowSlug}/Component`), false);
  passed.push("vault:register --remove deregisters local preview wiring");

  console.log(JSON.stringify({ ok: true, tests: passed }, null, 2));
} finally {
  try {
    fs.writeFileSync(INDEX_PATH, originalIndex);
  } catch {
    // Ignore cleanup errors in restricted environments.
  }
  for (const folderName of createdFolderNames) {
    try {
      fs.rmSync(path.join(ROOT, "src", "vaults", folderName), { recursive: true, force: true });
      fs.rmSync(path.join(ROOT, E2E_DIST_DIR, folderName), { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors in restricted environments.
    }
  }
  for (const packagePath of createdPackagePaths) {
    try {
      fs.rmSync(packagePath, { force: true });
    } catch {
      // Ignore cleanup errors in restricted environments.
    }
  }
}
