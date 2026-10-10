import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { runVaultCheck } from "./vault-check.mjs";

test("full checker preserves resolver review, accepts handles and flags legacy derived writes", () => {
  const slug = `resolved-check-${randomBytes(6).toString("hex")}`;
  const dir = path.join(process.cwd(), "src/vaults", slug);
  mkdirSync(dir);
  try {
    const manifest = JSON.parse(readFileSync("src/vaults/example/manifest.json", "utf8"));
    manifest.artifactId = `vaultui_${slug}_01HZY7J4S9D0W5XJ8H2Q3K4M5N`;
    const binding = manifest.match.bindings[0];
    binding.factoryAddress = "0xc3e4ee8f3c616d16297fafcb9daab122d31efa9e";
    binding.resolvedContracts = [{ id: "position", label: "nft", resolver: "function poolOf(uint256 id) view returns(address)", allow: ["function claim(uint256 amount)"], codeHash: `0x${"a".repeat(64)}`, checks: [{ kind: "owner", target: "resolved" }] }];
    const component = readFileSync("src/vaults/example/Component.tsx", "utf8");
    for (const name of ["i18n.json", "VaultABI.ts"]) writeFileSync(path.join(dir, name), readFileSync(`src/vaults/example/${name}`));
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    const call = 'async function resolvedAction(sdk, abi, id, amount) { const position = await sdk.resolveContract("position", [id]); return sdk.writeContract({contract:position,abi,functionName:"claim",args:[amount]}); }';
    const check = (code) => { writeFileSync(path.join(dir, "Component.tsx"), `${component}\n${code}`); return runVaultCheck(slug, { silent: true }); };
    const accepted = check(call);
    assert.equal(accepted.review.resolvedContracts[0].codeHash, binding.resolvedContracts[0].codeHash);
    assert.deepEqual(accepted.review.resolvedContracts[0].checks, binding.resolvedContracts[0].checks);
    assert(!accepted.issues.some((x) => x.severity === "blocking" && /resolved-contract|contract-boundary|manifest-binding\/disallowed-binding/.test(x.ruleId)), JSON.stringify(accepted.issues));
    assert(check(call.replace('functionName:"claim"', 'functionName:"steal"')).issues.some((x) => x.ruleId === "resolved-contract/invalid-call"));
    assert(check(call.replace('contract:position,', 'contract:position,address:nftAddress,')).issues.some((x) => x.ruleId === "resolved-contract/invalid-call"));
    const legacy = check('async function oldAction(sdk, nftAddress, abi) { return sdk.writeContract({contract:"nft",address:nftAddress,abi,functionName:"claim"}); }');
    assert.equal(legacy.review.legacyDerivedWrites.length, 1);
    delete binding.factoryAddress;
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    assert(check(call).issues.some((x) => x.ruleId === "resolved-contract/invalid-declaration"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
