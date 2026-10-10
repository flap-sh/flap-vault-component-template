import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { runVaultCheck } from "./vault-check.mjs";

test("full checker accepts review intent, emits evidence, and rejects provider/execute bypasses", () => {
  const slug = `nft-account-check-${randomBytes(6).toString("hex")}`;
  const dir = path.join(process.cwd(), "src/vaults", slug);
  mkdirSync(dir);
  try {
    const manifest = JSON.parse(readFileSync("src/vaults/example/manifest.json", "utf8"));
    manifest.artifactId = `vaultui_${slug}_01HZY7J4S9D0W5XJ8H2Q3K4M5N`;
    manifest.match.bindings[0].factoryAddress = "0xc3e4ee8f3c616d16297fafcb9daab122d31efa9e";
    manifest.match.bindings[0].nftAccountWithdrawals = [{ policyId: "reviewed-withdrawal", profile: "null-bag-withdraw-v1" }];
    const component = readFileSync("src/vaults/example/Component.tsx", "utf8");
    for (const name of ["i18n.json", "VaultABI.ts"]) writeFileSync(path.join(dir, name), readFileSync(`src/vaults/example/${name}`));
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    writeFileSync(path.join(dir, "Component.tsx"), component);
    const report = runVaultCheck(slug, { silent: true });
    assert.equal(report.review.nftAccountWithdrawals[0].policyId, "reviewed-withdrawal");
    assert(!report.issues.some((item) => item.ruleId === "manifest-binding/disallowed-binding-field"));
    for (const code of ['import { VaultRuntimeProvider as Forged } from "@/src/sdk";']) {
      writeFileSync(path.join(dir, "Component.tsx"), `${code}\n${component}`);
      assert(runVaultCheck(slug, { silent: true }).issues.some((item) => item.severity === "blocking" && item.ruleId.startsWith("nft-account/")));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
