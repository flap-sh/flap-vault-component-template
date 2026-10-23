import test from "node:test";
import assert from "node:assert/strict";
import { checkStandaloneWalletManifest, checkStandaloneWalletSource } from "./standalone-wallet-policy.mjs";
const address = "0x2222222222222222222222222222222222222222";
const app = { schemaVersion: 2, appModel: "standalone", mode: "mini-app", slug: "demo-app", match: { bindings: [] }, walletChains: [56], walletContracts: [{ id: "portal", chainId: 56, address, allow: ["function launch(uint256) payable"], read: ["function vaultOf(address) view returns (address)"], maxValueWei: "1000", resolvedContracts: [{ id: "rewards", resolver: "function vaultOf(address) view returns (address)", allow: ["function claim()"] }] }] };
const blocking = (issues) => issues.filter((x) => x.severity === "blocking");
test("declared App permissions produce an explicit review record", () => { const result = checkStandaloneWalletManifest(app); assert.deepEqual(blocking(result), []); assert.equal(result[0].address, address); assert.equal(result[0].chainId, 56); });
test("old read-only App remains valid without wallet declarations", () => { const old = { ...app }; delete old.walletChains; delete old.walletContracts; assert.deepEqual(checkStandaloneWalletManifest(old), []); });
test("wrong scope, duplicates, unsupported fields, undeclared network and uncapped payments fail closed", () => {
 for (const patch of [{ appModel: undefined }, { walletChains: [56,56] }, { walletChains: [97] }, { walletContracts: [] }, { walletContracts: [{ ...app.walletContracts[0], allow: ["function buy() payable"], maxValueWei: undefined }] }, { walletContracts: [{ ...app.walletContracts[0], arbitraryTargets: true }] }]) assert.ok(blocking(checkStandaloneWalletManifest({ ...app, ...patch })).length);
});
test("approvals require declared spenders and a positive cap", () => {
 const contract = { id: "token", chainId: 56, address, allow: ["function approve(address spender,uint256 amount) returns (bool)"] };
 assert.ok(blocking(checkStandaloneWalletManifest({ ...app, walletContracts: [contract] })).length);
 assert.deepEqual(blocking(checkStandaloneWalletManifest({ ...app, walletContracts: [{ ...contract, approvalSpenders: [address], maxApprovalWei: "100" }] })), []);
});
test("one SDK hook needs explicit chain and resolver IDs must be declared", () => {
 const good = 'import { useFlapSdk } from "@/src/sdk"; const sdk = useFlapSdk({ chainId: 56 }); const vault = await sdk.resolveContract("rewards", [token]); await sdk.writeContract({ contract: vault, abi, functionName: "claim" });';
 assert.deepEqual(blocking(checkStandaloneWalletSource(good, "Component.tsx", app)), []);
 assert.ok(blocking(checkStandaloneWalletSource(good.replace('{ chainId: 56 }',''), "Component.tsx", app)).length);
 assert.ok(blocking(checkStandaloneWalletSource(good.replace('"rewards"','"unknown"'), "Component.tsx", app)).length);
 assert.ok(blocking(checkStandaloneWalletSource(good.replace('contract: vault','contract: vault, address: other.address'), "Component.tsx", app)).length);
 assert.ok(blocking(checkStandaloneWalletSource(good, "Component.tsx", { ...app, walletContracts: undefined })).length);
});

import fs from "node:fs";
import path from "node:path";
import { runVaultCheck } from "./vault-check.mjs";
test("full upload checker accepts declared shared SDK writes and still blocks unknown targets", () => {
 const folder = `wallet-check-${process.pid}`; const dir = path.join(process.cwd(), "src/vaults", folder); fs.mkdirSync(dir, { recursive: true });
 const manifest = { ...app, artifactId: `vaultui_${folder}_01ARZ3NDEKTSV4RRFFQ69G5FAV`, name: "Wallet check", displayTitle: { en: "Wallet check", zh: "钱包测试" }, i18n: ["en", "zh", "ko"], walletContracts: [{ id: "vault", chainId: 56, address, allow: ["function claim()"] }] };
 const source = '"use client"; import { useFlapSdk } from "@/src/sdk"; import { VaultABI } from "./VaultABI"; export default function Component() { const sdk = useFlapSdk({ chainId: 56 }); async function claim() { const prepared = await sdk.simulateContract({ address: "'+address+'", abi: VaultABI, functionName: "claim" }); await sdk.writeContract(prepared.request); } return <main className="min-h-screen w-full p-6"><button onClick={claim}>{sdk.i18n.t("title")}</button></main>; }';
 const skip = process.env.VAULT_CHECK_SKIP_REGISTRATION; process.env.VAULT_CHECK_SKIP_REGISTRATION = "1";
 try {
  fs.writeFileSync(path.join(dir,"manifest.json"), JSON.stringify(manifest)); fs.writeFileSync(path.join(dir,"Component.tsx"), source);
  fs.writeFileSync(path.join(dir,"VaultABI.ts"), 'import { parseAbi } from "viem"; export const VaultABI = parseAbi(["function claim()"]);');
  fs.writeFileSync(path.join(dir,"i18n.json"), JSON.stringify({ en:{title:"Claim"}, zh:{title:"领取"}, ko:{title:"보상 받기"} }));
  assert.deepEqual(blocking(runVaultCheck(folder,{silent:true}).issues), []);
  fs.writeFileSync(path.join(dir,"Component.tsx"), source.replace(address, "0x3333333333333333333333333333333333333333"));
  assert.ok(blocking(runVaultCheck(folder,{silent:true}).issues).some((i) => i.ruleId.includes("undeclared-contract-address") || i.ruleId === "security/hardcoded-address"));
 } finally { fs.rmSync(dir,{recursive:true,force:true}); if (skip === undefined) delete process.env.VAULT_CHECK_SKIP_REGISTRATION; else process.env.VAULT_CHECK_SKIP_REGISTRATION=skip; }
});

test("dynamic targets cannot expose nested calldata executors", () => { const root = { ...app.walletContracts[0], resolvedContracts: [{ id: "unsafe", resolver: "function vaultOf(address) view returns (address)", allow: ["function callAnything(bytes)"] }] }; assert.ok(blocking(checkStandaloneWalletManifest({ ...app, walletContracts: [root] })).length); });
