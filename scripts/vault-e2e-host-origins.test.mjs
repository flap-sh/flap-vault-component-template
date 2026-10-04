import assert from "node:assert/strict";

import fs from "node:fs";

import path from "node:path";

import test from "node:test";

import { fileURLToPath } from "node:url";



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























