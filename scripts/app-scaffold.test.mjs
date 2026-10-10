import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { encodeFunctionResult, erc20Abi } from "viem";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { isStandaloneApp } from "./standalone-app.mjs";
import { checkStandaloneWalletManifest, checkStandaloneWalletSource } from "./standalone-wallet-policy.mjs";

const script = new URL("./app-scaffold.mjs", import.meta.url).pathname;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flap-app-scaffold-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "src/vaults"), { recursive: true });
  fs.writeFileSync(path.join(root, "src/vaults/index.ts"), 'export const vaultModules = {\n};\n\nexport function getVaultFolderNames() { return Object.keys(vaultModules); }\n');
  return root;
}

function scaffold(root, slug) {
  return spawnSync(process.execPath, [script, slug], { cwd: root, encoding: "utf8", timeout: 10_000 });
}

test("documented App scaffold generates shared-SDK source, v2 identity and matching locales", (t) => {
  const root = fixture(t);
  const result = scaffold(root, "my-app");
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.path, "/apps/my-app");
  assert.deepEqual(output.next, ["yarn app:check my-app", "yarn app:e2e my-app", "yarn app:package my-app", "yarn app:verify-package dist/my-app.zip"]);
  const dir = path.join(root, "src/vaults/my-app");
  assert.deepEqual(fs.readdirSync(dir).sort(), ["Component.tsx", "VaultABI.ts", "i18n.json", "manifest.json"]);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  assert.equal(isStandaloneApp(manifest), true);
  assert.equal(manifest.slug, "my-app");
  assert.deepEqual(manifest.match.bindings, []);
  assert.match(manifest.artifactId, /^vaultui_my-app_[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.equal(manifest.walletChains, undefined);
  assert.equal(manifest.walletContracts, undefined);
  const source = fs.readFileSync(path.join(dir, "Component.tsx"), "utf8");
  assert.match(source, /useFlapSdk\(\{ chainId: 56 \}\)/);
  assert.match(source, /wallet\.address/);
  assert.doesNotMatch(source, /useMiniAppSdk|tokenAddress|factoryAddress|vaultAddress/);
  assert.deepEqual(checkStandaloneWalletManifest(manifest), []);
  assert.deepEqual(checkStandaloneWalletSource(source, "Component.tsx", manifest), []);
  const transpiled = ts.transpileModule(source, { fileName: "Component.tsx", reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
  assert.deepEqual(transpiled.diagnostics, []);
  const i18n = JSON.parse(fs.readFileSync(path.join(dir, "i18n.json"), "utf8"));
  assert.deepEqual(Object.keys(i18n).sort(), [...manifest.i18n].sort());
  for (const locale of manifest.i18n) assert.deepEqual(Object.keys(i18n[locale]).sort(), Object.keys(i18n.en).sort());
  assert.match(fs.readFileSync(path.join(root, "src/vaults/index.ts"), "utf8"), /import\("\.\/my-app\/Component"\)/);
  const saved = fs.readFileSync(path.join(dir, "manifest.json"), "utf8");
  assert.notEqual(scaffold(root, "my-app").status, 0);
  assert.equal(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"), saved, "scaffolding must not replace an existing artifact identity");
});

test("App scaffold rejects reserved routes and invalid slugs without writing a package", (t) => {
  const root = fixture(t);
  for (const slug of ["apps", "admin", "../escape", "My-App", "ab"]) {
    assert.notEqual(scaffold(root, slug).status, 0, slug);
  }
  assert.deepEqual(fs.readdirSync(path.join(root, "src/vaults")), ["index.ts"]);
});


const execFileAsync = promisify(execFile);
const legacyScript = new URL("./vault-scaffold.mjs", import.meta.url).pathname;
const previewToken = "0x9adc2f9dbc4578808f0cdb30d51b5199ff4b8888";

async function rpcFixture(t) {
  const methods = {
    "0x313ce567": ["decimals", 18],
    "0x95d89b41": ["symbol", "TEST"],
    "0x18160ddd": ["totalSupply", 1000n],
    "0x70a08231": ["balanceOf", 0n],
  };
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    const entry = methods[request.params?.[0]?.data?.slice(0, 10)];
    const result = request.method === "eth_getCode" ? "0x6000" : entry
      ? encodeFunctionResult({ abi: erc20Abi, functionName: entry[0], result: entry[1] })
      : undefined;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(result === undefined
      ? { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Unexpected fixture RPC method" } }
      : { jsonrpc: "2.0", id: request.id, result }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { ...process.env, VAULT_CHECK_RPC_56: `http://127.0.0.1:${server.address().port}` };
}

test("existing v1 maintenance scaffolds warn while retaining token identity and RPC validation", async (t) => {
  const root = fixture(t);
  const env = await rpcFixture(t);
  for (const [folder, args] of [
    ["existing-token-app", ["--mode", "mini-app", "--token", previewToken]],
    ["legacy-three-app", ["--capability", "three-r3f-v1"]],
  ]) {
    const { stdout, stderr } = await execFileAsync(process.execPath, [legacyScript, folder, "--chain", "56", ...args], { cwd: root, env, timeout: 10_000 });
    assert.equal(JSON.parse(stdout).ok, true, "warning must not corrupt the legacy JSON output");
    assert.match(stderr, /\[mini-app-v1\/deprecated\]/);
    assert.match(stderr, /yarn app:scaffold <slug>/);
    assert.match(stderr, /Existing v1 Apps remain compatible/);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "src/vaults", folder, "manifest.json"), "utf8"));
    assert.equal(manifest.mode, "mini-app");
    assert.equal(isStandaloneApp(manifest), false);
    for (const field of ["schemaVersion", "appModel", "slug"]) assert.equal(manifest[field], undefined);
    assert.deepEqual(manifest.match.bindings[0].tokenAddresses, [previewToken]);
    assert.equal(manifest.match.bindings[0].chainId, 56);
  }
});

test("new Vault UI scaffolds remain supported without a v1 warning", async (t) => {
  const root = fixture(t);
  const env = await rpcFixture(t);
  const { stdout, stderr } = await execFileAsync(process.execPath, [legacyScript, "new-vault", "--chain", "56", "--factory", "0x3333333333333333333333333333333333333333", "--token", previewToken], { cwd: root, env, timeout: 10_000 });
  assert.equal(JSON.parse(stdout).ok, true);
  assert.doesNotMatch(stderr, /mini-app-v1\/deprecated/);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "src/vaults/new-vault/manifest.json"), "utf8"));
  assert.equal(manifest.mode, undefined);
  assert.equal(manifest.match.bindings[0].factoryAddress, "0x3333333333333333333333333333333333333333");
});

test("v1 deprecation does not relax invalid-binding validation", (t) => {
  const root = fixture(t);
  const result = spawnSync(process.execPath, [legacyScript, "invalid-old-app", "--mode", "mini-app", "--chain", "56", "--token", "0x0000000000000000000000000000000000000000"], { cwd: root, encoding: "utf8", timeout: 10_000 });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /mini-app-v1\/deprecated/);
  assert.equal(JSON.parse(result.stderr).code, "manifest-binding/invalid-address", "legacy failures must remain machine-readable JSON");
  assert.equal(fs.existsSync(path.join(root, "src/vaults/invalid-old-app")), false);
});
