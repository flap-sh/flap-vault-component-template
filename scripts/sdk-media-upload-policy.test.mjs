import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { runVaultCheck } from "./vault-check.mjs";

test("user-selected SDK uploads require no arbitrary browser network permission", async () => {
  const folder = `sdk-upload-test-${process.pid}`;
  const root = path.resolve("src/vaults", folder);
  await mkdir(root, { recursive: true });
  try {
    await writeFile(path.join(root, "manifest.json"), JSON.stringify({
      artifactId: `vaultui_${folder}_01K9V9Z0P0AAAAAAAAAAAAAAAA`,
      name: "Upload policy test", i18n: ["en"],
      match: { bindings: [{ chainId: 56, factoryAddress: "0xc3e4ee8f3c616d16297fafcb9daab122d31efa9e", tokenAddresses: ["0x286184b2660a2822671a33f24c4517f593947777"] }] },
    }));
    await writeFile(path.join(root, "VaultABI.ts"), "export const vaultAbi = [] as const;");
    await writeFile(path.join(root, "i18n.json"), JSON.stringify({ en: { title: "Upload" } }));
    const source = `"use client";
import { useFlapSdk } from "@/src/sdk";
export default function Component() {
  const sdk = useFlapSdk();
  return <div>
    <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" aria-label={sdk.i18n.t("title")} onChange={async (event) => {
      const file = event.currentTarget.files?.[0];
      if (file) await sdk.uploadImage(file);
    }} />
    <button onClick={async () => { await sdk.uploadText(sdk.i18n.t("title")); }}>{sdk.i18n.t("title")}</button>
  </div>;
}`;
    await writeFile(path.join(root, "Component.tsx"), source);
    const sdkCheck = runVaultCheck(folder, { silent: true });
    const networkIssues = (check) => check.issues.filter((item) => item.ruleId.startsWith("forbidden-api/") || item.ruleId.startsWith("endpoint-policy/"));
    assert.deepEqual(networkIssues(sdkCheck), []);
    await writeFile(path.join(root, "Component.tsx"), source.replace('await sdk.uploadText(sdk.i18n.t("title"))', 'await fetch("/api/runtime/upload", { method: "POST" })'));
    assert.ok(networkIssues(runVaultCheck(folder, { silent: true })).length > 0, "direct upload fetch must remain blocked");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
