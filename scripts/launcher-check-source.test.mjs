import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const checker = fileURLToPath(new URL("./launcher-check-source.mjs", import.meta.url));
const root = fileURLToPath(new URL("../", import.meta.url));
const customFactory = "0x1234567890abcdef1234567890abcdef12345678";
const detailComponent = "export function Launcher() { return null; }\n";
const creationComponent = detailComponent + "export function LauncherConfig() { return null; }\n";
const baseManifest = {
  schemaVersion: 2,
  kind: "launcher-ui",
  artifactId: "launcher-check-fixture",
  name: "Launcher check fixture",
  chainId: 97,
  factoryAddress: customFactory,
  entry: "Component.tsx",
};
const detailManifest = {
  ...baseManifest,
  configContract: "launcher-detail/v1",
  surfaces: ["launcher-ui"],
  reads: { expectedToken: { functionName: "expectedToken", returns: "address" } },
};
const crowdManifest = {
  ...baseManifest,
  configContract: "crowd-native-create/v1",
  factoryAddress: "0xc574f30e2ee26fe638eece6d9876217015cd0a38",
  surfaces: ["launcher-config", "launcher-ui"],
};

function fixture(t, manifest, component = detailComponent) {
  const directory = mkdtempSync(join(tmpdir(), "launcher-check-source-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, "Component.tsx"), component);
  writeFileSync(join(directory, "manifest.json"), JSON.stringify(manifest));
  writeFileSync(join(directory, "i18n.json"), JSON.stringify({
    en: { title: "Launcher" },
    zh: { title: "Launcher" },
    ko: { title: "Launcher" },
  }));
  return directory;
}

function checkSource(...args) {
  const result = spawnSync(process.execPath, [checker, ...args], { cwd: root, encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  const output = JSON.parse(result.status === 0 ? result.stdout : result.stderr);
  assert.equal(output.ok, result.status === 0);
  return output;
}

test("the creation and detail demos pass the source checker", () => {
  assert.equal(checkSource("examples/launcher-runtime/launcher-demo").configContract, "crowd-native-create/v1");
  assert.equal(checkSource("examples/launcher-runtime/launcher-detail-demo").configContract, "launcher-detail/v1");
});

for (const chainId of [56, 97]) {
  test(`a custom detail factory is accepted on chain ${chainId}`, t => {
    const result = checkSource(fixture(t, { ...detailManifest, chainId }));
    assert.equal(result.ok, true);
    assert.equal(result.chainId, chainId);
    assert.equal(result.factoryAddress, customFactory);
  });
}

test("an unsupported Launcher chain is rejected", t => {
  const result = checkSource(fixture(t, { ...detailManifest, chainId: 1 }));
  assert.equal(result.code, "launcher-source/unsupported-chain");
});

test("a generic creation preview accepts a custom factory and detail reads with both exports", t => {
  const manifest = {
    ...detailManifest,
    configContract: "launcher-config-preview/v1",
    surfaces: ["launcher-config", "launcher-ui"],
  };
  const directory = fixture(t, manifest, creationComponent);
  assert.equal(checkSource(directory).configContract, manifest.configContract);
  writeFileSync(join(directory, "Component.tsx"), detailComponent);
  assert.equal(checkSource(directory).code, "launcher-source/exports");
});

test("a generic creation preview rejects incomplete surfaces and malformed detail reads", t => {
  const manifest = {
    ...detailManifest,
    configContract: "launcher-config-preview/v1",
    surfaces: ["launcher-config", "launcher-ui"],
  };
  assert.equal(checkSource(fixture(t, { ...manifest, surfaces: ["launcher-ui"] }, creationComponent)).code,
    "launcher-source/manifest");
  assert.equal(checkSource(fixture(t, { ...manifest, reads: { invalid: { functionName: "name", returns: "string" } } }, creationComponent)).code,
    "launcher-source/reads");
});

test("generic Launcher wallet declarations match Workbench's transaction and account-read policy", t => {
  const actions = { subscribe: "payable", claim: "nonpayable" };
  const reads = Object.fromEntries(Array.from({ length: 16 }, (_, index) => [
    "value" + index, { functionName: "_read" + index, returns: "uint256", ...(index === 0 ? { account: true } : {}) },
  ]));
  const creation = {
    ...detailManifest,
    configContract: "launcher-config-preview/v1",
    surfaces: ["launcher-config", "launcher-ui"],
    transactions: { create: true, actions },
    reads,
  };
  assert.equal(checkSource(fixture(t, creation, creationComponent)).ok, true);
  const detail = { ...detailManifest, transactions: { actions }, reads };
  assert.equal(checkSource(fixture(t, detail)).ok, true);
  assert.equal(checkSource(fixture(t, { ...detail, transactions: { create: true, actions } })).code, "launcher-source/transactions");
  assert.equal(checkSource(fixture(t, { ...crowdManifest, transactions: { create: true } }, creationComponent)).code, "launcher-source/manifest");
  for (const invalid of [null, {}, { create: false }, { create: true, target: customFactory }, { actions: {} },
    { actions: { "claim()": "nonpayable" } }, { actions: { claim: "view" } }, { actions: { constructor: "payable" } },
    { actions: Object.fromEntries(Array.from({ length: 9 }, (_, index) => ["action" + index, "payable"])) }]) {
    assert.equal(checkSource(fixture(t, { ...creation, transactions: invalid }, creationComponent)).code, "launcher-source/transactions");
  }
  assert.equal(checkSource(fixture(t, { ...creation, reads: { ...reads, extra: reads.value1 } }, creationComponent)).code, "launcher-source/reads");
  assert.equal(checkSource(fixture(t, { ...detailManifest, reads: { value: reads.value0 } })).code, "launcher-source/reads");
  assert.equal(checkSource(fixture(t, { ...detail, reads: { value: { ...reads.value0, account: false } } })).code, "launcher-source/reads");
  const ninePublicReads = Object.fromEntries(Object.entries(reads).slice(1, 10));
  assert.equal(checkSource(fixture(t, { ...detailManifest, reads: ninePublicReads })).code, "launcher-source/reads");
});

test("a creation adapter unavailable on the chosen chain is rejected", t => {
  const result = checkSource(fixture(t, { ...crowdManifest, chainId: 56 }, creationComponent));
  assert.equal(result.code, "launcher-source/unsupported-config-contract");
});

test("an unrecognized creation adapter is rejected", t => {
  const result = checkSource(fixture(t, { ...crowdManifest, configContract: "custom-create/v1" }, creationComponent));
  assert.equal(result.code, "launcher-source/unsupported-config-contract");
});

test("a recognized creation adapter cannot be used by another factory", t => {
  const result = checkSource(fixture(t, { ...crowdManifest, factoryAddress: customFactory }, creationComponent));
  assert.equal(result.code, "launcher-source/factory");
});

test("the existing mainnet adapter accepts its two component exports", t => {
  const manifest = {
    ...crowdManifest,
    chainId: 56,
    factoryAddress: "0xCE18f9de452c63d806a9c273efa09ed1f80b3ba3",
    configContract: "agent-raise-create/v1",
  };
  assert.equal(checkSource(fixture(t, manifest, creationComponent)).configContract, manifest.configContract);
});

test("the local demo still passes with --local", () => {
  const result = checkSource("--local", "examples/launcher-local/launcher-redirect-demo");
  assert.equal(result.localOnly, true);
  assert.equal(result.configContract, undefined);
});

test("a source file over the Launcher size limit is rejected", t => {
  const component = detailComponent.padEnd(256_001, " ");
  const result = checkSource(fixture(t, detailManifest, component));
  assert.equal(result.code, "launcher-source/source-size");
});

test("individually valid source sizes can exceed the combined limit", t => {
  const directory = fixture(t, detailManifest, detailComponent.padEnd(256_000, " "));
  writeFileSync(join(directory, "manifest.json"), JSON.stringify(detailManifest).padEnd(256_000, " "));
  const result = checkSource(directory);
  assert.equal(result.code, "launcher-source/source-size");
  assert.match(result.error, /total/);
});
