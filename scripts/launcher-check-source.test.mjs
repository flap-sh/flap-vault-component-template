import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { inflateRawSync } from "node:zlib";

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

function temporaryDirectory(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "launcher-check-source-")));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function fixture(t, manifest, component = detailComponent) {
  const directory = temporaryDirectory(t);
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
  return runLauncher(root, ...args);
}

function runLauncher(cwd, ...args) {
  const result = spawnSync(process.execPath, [checker, ...args], { cwd, encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  const output = JSON.parse(result.status === 0 ? result.stdout : result.stderr);
  assert.equal(output.ok, result.status === 0);
  return output;
}

function assertSourceIssue(result, rule, line) {
  assert.equal(result.ok, false);
  const issue = result.issues.find(issue => issue.ruleId.endsWith(`/${rule}`));
  assert.ok(issue, `Expected ${rule} in ${JSON.stringify(result.issues)}`);
  assert.equal(issue.file, "Component.tsx");
  assert.equal(issue.line, line);
  assert.ok(Number.isInteger(issue.column) && issue.column > 0);
  assert.equal(issue.severity, "blocking");
  assert.ok(issue.message?.trim());
  assert.ok(issue.fixHint?.trim());
}

function readZipEntries(zip) {
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50);
  assert.equal(zip.readUInt16LE(end + 10), 3);
  assert.equal(zip.readUInt16LE(end + 20), 0);
  let central = zip.readUInt32LE(end + 16);
  const entries = new Map();
  for (let index = 0; index < 3; index += 1) {
    assert.equal(zip.readUInt32LE(central), 0x02014b50);
    const method = zip.readUInt16LE(central + 10);
    const compressedSize = zip.readUInt32LE(central + 20);
    const nameLength = zip.readUInt16LE(central + 28);
    assert.equal(zip.readUInt16LE(central + 30), 0, "central directory extra field");
    assert.equal(zip.readUInt16LE(central + 32), 0, "file comment");
    const name = zip.toString("utf8", central + 46, central + 46 + nameLength);
    const local = zip.readUInt32LE(central + 42);
    assert.equal(zip.readUInt32LE(local), 0x04034b50);
    assert.equal(zip.readUInt16LE(local + 28), 0, "local header extra field");
    const data = local + 30 + zip.readUInt16LE(local + 26);
    assert.equal(zip.toString("utf8", local + 30, data), name);
    const compressed = zip.subarray(data, data + compressedSize);
    assert.ok(method === 0 || method === 8);
    entries.set(name, method === 8 ? inflateRawSync(compressed) : compressed);
    central += 46 + nameLength;
  }
  assert.equal(central, end);
  return entries;
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

test("source checking and packing report both a data URI and its image element", t => {
  const directory = fixture(t, detailManifest, [
    'const icon = "data:image/webp;base64,AA==";',
    "export function Launcher() {",
    '  return <img src={icon} alt="" />;',
    "}",
  ].join("\n"));
  const output = join(temporaryDirectory(t), "invalid.zip");

  const checked = checkSource(directory);
  assertSourceIssue(checked, "resource-url", 1);
  assertSourceIssue(checked, "resource-tag", 3);

  const packed = checkSource("--package", directory, output);
  assert.deepEqual(packed.issues, checked.issues);
  assert.equal(existsSync(output), false);
});

test("source checking reports unsupported imports and constructors", t => {
  const directory = fixture(t, detailManifest, [
    'import { formatEther } from "viem";',
    "export function Launcher() {",
    "  return String(new Date(0));",
    "}",
  ].join("\n"));
  const result = checkSource(directory);
  assertSourceIssue(result, "source-import", 1);
  assertSourceIssue(result, "source-constructor", 3);
});

test("configuration previews require create permission for host submission", t => {
  const manifest = {
    ...detailManifest,
    configContract: "launcher-config-preview/v1",
    surfaces: ["launcher-config", "launcher-ui"],
  };
  const directory = fixture(t, manifest, [
    "export function Launcher() { return null; }",
    "export function LauncherConfig({ host }) {",
    "  const submit = () => host.submit();",
    "  return <button onClick={submit}>Create</button>;",
    "}",
  ].join("\n"));
  assertSourceIssue(checkSource(directory), "config-action", 3);
  writeFileSync(join(directory, "manifest.json"), JSON.stringify({ ...manifest, transactions: { create: true } }));
  assert.equal(checkSource(directory).ok, true);
});

test("the package command accepts callable date formatting and writes three root entries unchanged", t => {
  const directory = fixture(t, detailManifest, [
    "export function Launcher() {",
    '  const dates = Intl.DateTimeFormat("en-GB", { timeZone: "UTC" });',
    "  return dates.format(0);",
    "}",
  ].join("\n"));
  const outputDirectory = temporaryDirectory(t);
  const result = runLauncher(outputDirectory, "--package", directory);
  const output = join(outputDirectory, "dist", `${detailManifest.artifactId}-launcher.zip`);
  assert.equal(result.ok, true);
  assert.equal(result.sourcePackageAbsolutePath, output);
  const entries = readZipEntries(readFileSync(output));
  const files = ["Component.tsx", "i18n.json", "manifest.json"];
  assert.deepEqual([...entries.keys()].sort(), files);
  for (const file of files) {
    assert.deepEqual(entries.get(file), readFileSync(join(directory, file)), file);
  }
});

test("the package command preserves an existing destination", t => {
  const directory = fixture(t, detailManifest);
  const output = join(temporaryDirectory(t), "launcher.zip");
  const original = Buffer.from("existing archive bytes");
  writeFileSync(output, original);

  assert.equal(checkSource("--package", directory, output).code, "launcher-source/output-exists");
  assert.deepEqual(readFileSync(output), original);
});
