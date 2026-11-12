import assert from "node:assert/strict";

import fs from "node:fs";

import path from "node:path";

import test from "node:test";

import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { collectDeclaredFetchUrls } from "./endpoint-declarations.mjs";
import { isAllowedExternalRead } from "./e2e-external-reads.mjs";



const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const walletProvidersSource = fs.readFileSync(path.join(ROOT, "src/shell/WalletRuntimeProviders.tsx"), "utf8");

const vaultE2eSource = fs.readFileSync(path.join(ROOT, "scripts/vault-e2e.mjs"), "utf8");



function extractUrlArray(source, constantName) {
  
  const match = source.match(new RegExp(`const\\s+${constantName}\\s*=\\s*\\[(.*?)\\]\\s*as const;`, "s"));
  
  assert.ok(match, `Could not find ${constantName}`);
  
  return [...match[1].matchAll(/["'](https?:\/\/[^"']+)["']/g)].map((entry) => entry[1]);
  
}



function extractHostOwnedOrigins(source) {
  
  const match = source.match(/const\s+HOST_OWNED_EXTERNAL_ORIGINS\s*=\s*new Set\(\[(.*?)\]\);/s);
  
  assert.ok(match, "Could not find HOST_OWNED_EXTERNAL_ORIGINS");
  
  return new Set([...match[1].matchAll(/["'](https?:\/\/[^"']+)["']/g)].map((entry) => new URL(entry[1]).origin));
  
}



const previewRpcUrls = [
  
  ...extractUrlArray(walletProvidersSource, "defaultBscRpcUrls"),
  
  ...extractUrlArray(walletProvidersSource, "defaultBscTestnetRpcUrls"),
  
  ...extractUrlArray(walletProvidersSource, "defaultRobinhoodRpcUrls"),
  
  ...extractUrlArray(walletProvidersSource, "defaultRobinhoodTestnetRpcUrls"),
  
];

const hostOwnedOrigins = extractHostOwnedOrigins(vaultE2eSource);

const testnetFsi = "https://bsc-testnet-debug.butterfly.army/fsi/v1";
const mainnetFsi = "https://fsi.taxed.fun/fsi/v1";
const cid = "bafkreicllrojftwdwi7gukkpydxkimru55isnrngj5ggyuy2zbbqvmfyiq";
const ipfsUrl = `https://flap.mypinata.cloud/ipfs/${cid}`;

function allowedRead(url, { endpoints, type = "fetch", method = "GET", redirected = false } = {}) {
  const request = {
    url: () => url,
    method: () => method,
    resourceType: () => type,
    redirectedFrom: () => redirected ? {} : null,
  };
  return isAllowedExternalRead(request, new URL(url), collectDeclaredFetchUrls({ endpoints }));
}

test("3D E2E accepts FSI fetches covered by a declared root or a specific direct-fetch endpoint", () => {
  const query = `${testnetFsi}/vault/B/stats?round=0&cursor=a%2Fb`;
  assert.equal(allowedRead(query, { endpoints: testnetFsi }), true);
  assert.equal(allowedRead(query, { endpoints: [mainnetFsi, `${testnetFsi}/`] }), true);
  assert.equal(allowedRead(query, { endpoints: query }), true);
  assert.equal(allowedRead(query, { endpoints: `${testnetFsi}/vault/B/stats?round=1` }), false);
});

test("3D E2E still reports undeclared and unsafe FSI requests", () => {
  const query = `${testnetFsi}/vault/B/stats?round=0`;
  for (const options of [
    {}, { endpoints: mainnetFsi }, { endpoints: testnetFsi, method: "POST" },
    { endpoints: testnetFsi, type: "image" }, { endpoints: testnetFsi, redirected: true },
  ]) assert.equal(allowedRead(query, options), false);

  for (const url of [
    testnetFsi.replace("/fsi/v1", "/fsi/versions"),
    `${testnetFsi}0/vault`,
    `${testnetFsi}/vault/%2e%2e/stats`,
    `${testnetFsi}/vault%2Fstats`,
    `${testnetFsi}/stats#fragment`,
    "https://example.invalid/fsi/v1/stats",
  ]) assert.equal(allowedRead(url, { endpoints: [testnetFsi, url] }), false, url);
});

test("3D E2E accepts canonical image and text reads on both SDK IPFS gateways", async () => {
  const { build } = createRequire(import.meta.resolve("tsup"))("esbuild");
  const compiled = await build({
    entryPoints: [path.join(ROOT, "src/sdk/ipfsImage.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  const { resolveIpfsImageUrls } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}`);
  const imageUrls = resolveIpfsImageUrls(cid, 56);
  const textUrls = resolveIpfsImageUrls(cid, 56, "metadata/project.json");
  assert.equal(imageUrls.length, 2);
  assert.equal(textUrls.length, 2);
  for (const url of imageUrls) assert.equal(allowedRead(url, { type: "image" }), true, url);
  for (const url of textUrls) assert.equal(allowedRead(url), true, url);
});

test("3D E2E still reports other resource types, gateways, and IPFS paths", () => {
  for (const options of [
    { type: "script" }, { type: "media" }, { type: "xhr" },
    { method: "POST" }, { redirected: true },
  ]) assert.equal(allowedRead(ipfsUrl, options), false);

  for (const url of [
    ipfsUrl.replace("flap.mypinata.cloud", "other.mypinata.cloud"),
    ipfsUrl.replace("/ipfs/", "/api/"),
    ipfsUrl.replace(cid, "not-a-cid"),
    ipfsUrl.replace(cid, `b${"a".repeat(128)}`),
    ipfsUrl.replace("flap.mypinata.cloud", "flap.mypinata.cloud:444"),
    ipfsUrl.replace("https://", "https://user@"),
    `${ipfsUrl}?download=true`,
    `${ipfsUrl}#fragment`,
    `${ipfsUrl}/nested/../metadata.json`,
    `${ipfsUrl}/nested/%2Fmetadata.json`,
    `${ipfsUrl}//metadata.json`,
    `${ipfsUrl}/${"a".repeat(513)}`,
  ]) assert.equal(allowedRead(url, { endpoints: url }), false, url);
});


test("vault E2E classifies every built-in preview RPC origin as host-owned", () => {
  
  const expectedOrigins = [...new Set(previewRpcUrls.map((url) => new URL(url).origin))].sort();
  
  const missingOrigins = expectedOrigins.filter((origin) => !hostOwnedOrigins.has(origin));
  

  
  assert.deepEqual(
    
    missingOrigins,
    
    [],
    
    `HOST_OWNED_EXTERNAL_ORIGINS is missing preview-host RPC origin(s): ${missingOrigins.join(", ")}`,
    
  );
  
});



test("vault E2E host-owned origin list does not become an arbitrary external-request bypass", () => {
  
  assert.equal(hostOwnedOrigins.has("https://example.invalid"), false);
  
});























