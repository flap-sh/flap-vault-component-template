#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { runVaultCheck } from "./vault-check.mjs";

const ROOT = process.cwd();
const FIXTURE_PREFIX = `check-selftest-${process.pid}-${Date.now()}`;
const FACTORY = "0x1000000000000000000000000000000000000001";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const TOKEN = "0x2000000000000000000000000000000000000002";
const VAULT = "0x3000000000000000000000000000000000000003";
const EXTERNAL_CONTRACT = "0x4000000000000000000000000000000000000004";
const FIXTURE_ULID = "01K9V9Z0P0AAAAAAAAAAAAAAAA";
const INDEX_PATH = path.join(ROOT, "src", "vaults", "index.ts");
const originalIndex = fs.readFileSync(INDEX_PATH, "utf8");

const createdFolderNames = [];
const createdPackagePaths = [];
const passed = [];

function baseManifest(overrides = {}) {
  return {
    name: "Selftest Vault UI",
    match: {
      bindings: [{ chainId: 56, factoryAddress: FACTORY }],
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

function assertRule(label, result, ruleId, severity) {
  const found = result.issues.find((item) => item.ruleId === ruleId && (!severity || item.severity === severity));
  assert.ok(found, `${label}: expected ${severity || "any"} ${ruleId}`);
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
  passed.push("binding-level tokenAddresses reference lists are allowed");

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

  const missingTargetSlug = `${FIXTURE_PREFIX}-missing-target`;
  writeVault(missingTargetSlug, {
    manifest: baseManifest({
      match: {
        bindings: [{ chainId: 56 }],
      },
    }),
  });
  assertRule("bindings without factory or Vault are blocked", runVaultCheck(missingTargetSlug, { silent: true }), "manifest-binding/missing-binding-target", "blocking");

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
        bindings: [{ chainId: 56, vaultAddresses: [VAULT], tokenAddresses: [TOKEN, EXTERNAL_CONTRACT] }],
      },
    }),
  });
  assertRule("single-Vault bindings allow at most one token", runVaultCheck(multiTokenVaultSlug, { silent: true }), "manifest-binding/invalid-token-address-list", "blocking");

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
  void fetch("https://api.example.com/proof/details");
  return <div>{i18n.t("title")}</div>;
}
`,
  });
  assert.equal(runVaultCheck(declaredFetchSlug, { silent: true }).issues.some((item) => item.ruleId === "endpoint-policy/direct-fetch"), false);
  passed.push("declared static HTTPS fetch child paths are allowed for review");

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
  return <a href="https://bscscan.com/address/0x2000000000000000000000000000000000000002">{i18n.t("title")}</a>;
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
  assertRule("standard ERC20 ABI names are flagged in VaultABI.ts", runVaultCheck(abiSlug, { silent: true }), "contract-abi/standard-erc20-in-vault-abi", "warning");

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
  assertRule("write paths warn when market phase gating is missing", runVaultCheck(stageGatingSlug, { silent: true }), "manual-review/action-stage-gating", "warning");

  const scaffoldFlowSlug = `${FIXTURE_PREFIX}-flow`;
  assert.throws(() =>
    execFileSync(process.execPath, ["scripts/vault-scaffold.mjs", `${FIXTURE_PREFIX}-zero-scaffold`, "--chain", "56", "--factory", ZERO_ADDRESS, "--locales", "en"], {
      cwd: ROOT,
      stdio: "pipe",
    }),
  );
  passed.push("scaffold rejects zero factory input");

  createdFolderNames.push(scaffoldFlowSlug);
  createdPackagePaths.push(path.join(ROOT, "dist", `${scaffoldFlowSlug}.zip`));
  execFileSync(process.execPath, ["scripts/vault-scaffold.mjs", scaffoldFlowSlug, "--chain", "56", "--factory", FACTORY, "--locales", "en,zh"], {
    cwd: ROOT,
    stdio: "pipe",
  });
  assert.ok(fs.readFileSync(INDEX_PATH, "utf8").includes(`\n  "${scaffoldFlowSlug}": {`));
  passed.push("scaffold registration keeps each module entry on its own line");

  const scaffoldCheck = runVaultCheck(scaffoldFlowSlug, { silent: true });
  assert.equal(scaffoldCheck.summary.blocking, 0);
  passed.push("scaffolded package passes vault:check");

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
