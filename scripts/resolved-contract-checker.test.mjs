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
    const signature = "function execute(address,uint256,bytes,uint8) payable returns(bytes)";
    binding.resolvedContracts[0].allow = [signature];
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    const executeCall = 'async function executeAction(sdk, abi, id, target, data) { const position = await sdk.resolveContract("position", [id]); const prepared = await sdk.simulateContract({contract:position,abi,functionName:"execute",args:[target,0n,data,0]}); return sdk.writeContract(prepared.request); }';
    const execution = check(executeCall);
    assert.deepEqual(execution.review.resolvedContracts[0].allow, [signature]);
    assert.deepEqual(execution.review.resolvedContracts[0].checks, binding.resolvedContracts[0].checks);
    assert.match(execution.review.resolvedContracts[0].message, /nested targets/);
    assert(!execution.issues.some((x) => x.severity === "blocking" && /resolved-contract|contract-boundary|nft-account|manifest-binding\/disallowed-binding/.test(x.ruleId)), JSON.stringify(execution.issues));
    assert(check(executeCall.replace('functionName:"execute"', 'functionName:"executeCall"')).issues.some((x) => x.ruleId === "resolved-contract/invalid-call"));
    binding.resolvedContracts[0].allow = ["function claim(uint256 amount)"];
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    assert(check(executeCall).issues.some((x) => x.ruleId === "resolved-contract/invalid-call"));
    delete binding.factoryAddress;
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    assert(check(call).issues.some((x) => x.ruleId === "resolved-contract/invalid-declaration"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("full checker retains the reviewed 13-method Vault assembly subset and host review requirements", () => {
  const slug = `assembly-check-${randomBytes(6).toString("hex")}`;
  const dir = path.join(process.cwd(), "src/vaults", slug);
  mkdirSync(dir);
  try {
    const manifest = JSON.parse(readFileSync("src/vaults/example/manifest.json", "utf8"));
    manifest.artifactId = `vaultui_${slug}_01HZY7J4S9D0W5XJ8H2Q3K4M5N`;
    const binding = manifest.match.bindings[0];
    binding.factoryAddress = "0xc3e4ee8f3c616d16297fafcb9daab122d31efa9e";
    binding.resolvedContracts = [{
      id: "vault-assembly-v1",
      label: "vault",
      resolver: "function businessVault() view returns (address)",
      allow: [
        "function commitTapeout(bytes32 commitment)",
        "function revealTapeout(address,uint256[5],bytes,bytes32,bytes32) payable returns (uint256)",
        "function verifyMiner(uint256 id) returns (bool)",
        "function approve(address spender,uint256 amount) returns (bool)",
        "function openFarmStakeAmount(uint256 tier,uint256 farmId,uint256 amount) returns (uint256)",
        "function buyFuel(uint256 id,uint256 tier,uint256 durationIndex,uint256 maximumCost) returns (uint256)",
        "function claimFarmProduction(uint256 id) returns (uint256)",
        "function claimStakePrincipal(uint256 id) returns (uint256)",
        "function claimRewards(address account,uint256[] miners,uint256[] stakes,uint256[] farms) returns ((address token,address account,(uint256[] ids,uint256[] amounts,uint256 total) miners,(uint256[] ids,uint256[] amounts,uint256 total) stakes,(uint256[] ids,uint256[] amounts,uint256 total) farms,uint256 total,uint256 positiveCount,uint256 asOfBlock,uint64 asOf,bool complete,uint64 nextExpiry))",
        "function createFarm(string name,uint256 expectedBurnCost,string logoCID) returns (uint256)",
        "function upgradeFarm(uint256 id)",
        "function joinFarm(uint256 id,uint256 farmId)",
        "function exitFarm(uint256 id)",
      ],
    }];
    const component = readFileSync("src/vaults/example/Component.tsx", "utf8");
    for (const name of ["i18n.json", "VaultABI.ts"]) writeFileSync(path.join(dir, name), readFileSync(`src/vaults/example/${name}`));
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    const actions = `async function reviewedActions(sdk, abi, amount, tier, farmId, minerId, durationIndex, farmName, logoCid) {
      const runtime = await sdk.resolveContract("vault-assembly-v1", []);
      await sdk.simulateContract({ contract: runtime, abi, functionName: "approve", args: [runtime.address, amount] });
      await sdk.simulateContract({ contract: runtime, abi, functionName: "openFarmStakeAmount", args: [tier, farmId, amount] });
      await sdk.simulateContract({ contract: runtime, abi, functionName: "buyFuel", args: [minerId, tier, durationIndex, amount] });
      await sdk.simulateContract({ contract: runtime, abi, functionName: "createFarm", args: [farmName, amount, logoCid] });
      await sdk.simulateContract({ contract: runtime, abi, functionName: "upgradeFarm", args: [farmId] });
      await sdk.simulateContract({ contract: runtime, abi, functionName: "joinFarm", args: [minerId, farmId] });
      await sdk.simulateContract({ contract: runtime, abi, functionName: "exitFarm", args: [minerId] });
      return sdk.writeContract({ contract: runtime, abi, functionName: "claimFarmProduction", args: [farmId] });
    }`;
    const check = (source) => {
      writeFileSync(path.join(dir, "Component.tsx"), `${component}\n${source}`);
      return runVaultCheck(slug, { silent: true });
    };
    const accepted = check(actions);
    const review = accepted.review.resolvedContracts[0];
    assert.equal(review.allow.length, 13);
    assert.deepEqual(review.allow, binding.resolvedContracts[0].allow);
    assert.match(review.message, /verified manifest and component SHA-256 digests/);
    assert.match(review.message, /Runtime spender and bounded approval amount/);
    assert(!accepted.issues.some((issue) => issue.severity === "blocking" && /resolved-contract|contract-boundary|manifest-binding\/disallowed-binding/.test(issue.ruleId)), JSON.stringify(accepted.issues));
    assert(check(actions.replace('functionName: "claimFarmProduction"', 'functionName: "claimMiner"')).issues.some((issue) => issue.ruleId === "resolved-contract/invalid-call"));
    assert(check(actions.replace('"vault-assembly-v1", []', '"vault-assembly-v1", [projectId]')).issues.some((issue) => issue.ruleId === "resolved-contract/invalid-call"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
