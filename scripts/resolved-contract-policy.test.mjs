import assert from "node:assert/strict";
import test from "node:test";
import { parseResolvedContract, VAULT_ASSEMBLY_ID } from "../src/sdk/resolvedContractPolicy.mjs";
import { checkResolvedContractDeclarations,checkResolvedContractSource } from "./resolved-contract-policy.mjs";
const entry={id:"position",label:"nft",resolver:"function poolOf(uint256 round) view returns(address)",allow:["function claim(uint256 amount)"]};
const declaration = {
  id: VAULT_ASSEMBLY_ID,
  label: "vault",
  resolver: "function businessVault() view returns (address)",
  allow: [
    "function commitTapeout(bytes32 commitment)",
    "function revealTapeout(address,uint256[5],bytes,bytes32,bytes32) payable returns (uint256)",
  ],
};
const verifyMiner = "function verifyMiner(uint256 minerId) returns (bool)";
const tokenActions = [
  "function approve(address spender,uint256 amount) returns (bool)",
  "function openFarmStake(uint256 tier,uint256 farmId) returns (uint256)",
  "function openFarmStakeAmount(uint256 tier,uint256 farmId,uint256 amount) returns (uint256)",
  "function buyFuel(uint256 id,uint256 tier,uint256 durationIndex,uint256 maximumCost) returns (uint256)",
  "function claimFarmProduction(uint256 id) returns (uint256)",
  "function claimMiner(uint256 id) returns (uint256)",
  "function claimStakePrincipal(uint256 id) returns (uint256)",
  "function claimStakeReward(uint256 id) returns (uint256)",
  "function claimMany(uint256[] minerIds) returns ((address token,address account,uint256[] minerIds,uint256[] amounts,uint256 total,uint256 positiveCount,uint64 asOf,bool complete,uint64 nextExpiry,uint256 asOfBlock))",
  "function claimRewards(address account,uint256[] miners,uint256[] stakes,uint256[] farms) returns ((address token,address account,(uint256[] ids,uint256[] amounts,uint256 total) miners,(uint256[] ids,uint256[] amounts,uint256 total) stakes,(uint256[] ids,uint256[] amounts,uint256 total) farms,uint256 total,uint256 positiveCount,uint256 asOfBlock,uint64 asOf,bool complete,uint64 nextExpiry))",
];
const farmActions = [
  "function createFarm(string name,uint256 expectedBurnCost,string logoCID) returns (uint256)",
  "function upgradeFarm(uint256 id)",
  "function joinFarm(uint256 id,uint256 farmId)",
  "function exitFarm(uint256 id)",
];

test("Existing two-method Vault assembly declarations retain their BNB Chain factory scope", () => {
  const binding = { chainId: 97, factoryAddress: "0x123", resolvedContracts: [declaration] };
  const issues = checkResolvedContractDeclarations([declaration], "field", binding);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /independent host approval/);
  assert.doesNotMatch(issues[0].message, /verifyMiner/);
  assert.ok(checkResolvedContractDeclarations([declaration], "field", { ...binding, chainId: 56 }).every((issue) => issue.severity === "warning"));
  assert.ok(checkResolvedContractDeclarations([declaration], "field", { ...binding, chainId: 1 }).some((issue) => issue.severity === "blocking"));
  assert.ok(checkResolvedContractDeclarations([declaration, entry], "field", binding).some((issue) => issue.severity === "blocking"));
  assert.ok(checkResolvedContractDeclarations([declaration], "field", { ...binding, nftAccountWithdrawals: [] }).some((issue) => issue.severity === "blocking"));
  assert.throws(() => parseResolvedContract({ ...declaration, id: "another-project" }), /invalid-resolver/);
  assert.throws(() => parseResolvedContract({ ...declaration, resolver: entry.resolver }), /invalid-assembly-resolver/);
  assert.throws(() => parseResolvedContract({ ...declaration, allow: [declaration.allow[0], "function execute(bytes)"] }), /invalid-assembly-writes/);
  assert.throws(() => parseResolvedContract({ ...declaration, maxValueWei: "10" }), /invalid-assembly-declaration/);
  const call = `const runtime = await sdk.resolveContract("${VAULT_ASSEMBLY_ID}", []);`;
  assert.deepEqual(checkResolvedContractSource(call, "Component.tsx", [binding]), []);
  assert.ok(checkResolvedContractSource(call.replace("[]", "[projectId]"), "Component.tsx", [binding]).some((issue) => issue.severity === "blocking"));
});

test("Vault assembly grants and reports verification only when declared with its exact ABI", () => {
  const allow = [verifyMiner, ...declaration.allow];
  const updated = { ...declaration, allow };
  const binding = { chainId: 97, factoryAddress: "0x123", resolvedContracts: [updated] };
  const [review] = checkResolvedContractDeclarations([updated], "field", binding);
  assert.equal(review.ruleId, "manual-review/resolved-contract");
  assert.deepEqual(review.allow, allow);
  assert.match(review.message, /verified manifest and component SHA-256 digests/);
  assert.match(review.message, /commitTapeout, revealTapeout, verifyMiner/);

  const call = `const runtime = await sdk.resolveContract("${VAULT_ASSEMBLY_ID}", []);
    await sdk.simulateContract({ contract: runtime, abi, functionName: "verifyMiner", args: [minerId] });`;
  assert.deepEqual(checkResolvedContractSource(call, "Component.tsx", [binding]), []);
  assert.ok(checkResolvedContractSource(call, "Component.tsx", [{ ...binding, resolvedContracts: [declaration] }]).some((issue) => issue.severity === "blocking"));
  assert.ok(checkResolvedContractSource(call.replace("simulateContract", "readContract"), "Component.tsx", [binding]).some((issue) => issue.severity === "blocking"));

  const [commit, reveal] = declaration.allow;
  for (const invalid of [
    [verifyMiner, reveal],
    [commit, verifyMiner],
    [commit, reveal, commit],
    [commit, reveal, verifyMiner, verifyMiner],
    [commit, reveal, verifyMiner, "function burnMiner(uint256)"],
    ...[
      "function verifyMiner(bytes32) returns (bool)",
      "function verifyMiner(uint256) returns (uint256)",
      "function verifyMiner(uint256)",
      "function verifyMiner(uint256) view returns (bool)",
      "function verifyMiner(uint256) payable returns (bool)",
    ].map((invalidAbi) => [commit, reveal, invalidAbi]),
  ]) {
    assert.throws(() => parseResolvedContract({ ...declaration, allow: invalid }), /invalid-assembly-writes/);
  }
});

test("Vault assembly accepts only the exact declared staking, fuel, approval and claim subset", () => {
  for (const action of tokenActions) {
    const updated = { ...declaration, allow: [action, ...declaration.allow] };
    const parsed = parseResolvedContract(updated);
    assert.equal(parsed.writes.length, 3);
    assert.deepEqual(parsed.definition.allow, updated.allow);
    const name = action.match(/^function ([^(]+)/)[1];
    assert.deepEqual(parsed.writes.map((method) => method.name), ["commitTapeout", "revealTapeout", name]);
    assert.throws(() => parseResolvedContract({ ...updated, allow: [...updated.allow, action] }), /invalid-assembly-writes/);
    for (const mutability of ["view", "payable"]) {
      assert.throws(() => parseResolvedContract({
        ...updated,
        allow: [...declaration.allow, action.replace(" returns", ` ${mutability} returns`)],
      }), /invalid-assembly-writes/);
    }
  }

  const allow = [...tokenActions, verifyMiner, ...declaration.allow].reverse();
  const updated = { ...declaration, allow };
  const binding = { chainId: 97, factoryAddress: "0x123", resolvedContracts: [updated] };
  assert.equal(parseResolvedContract(updated).writes.length, allow.length);
  const [review] = checkResolvedContractDeclarations([updated], "field", binding);
  assert.equal(review.ruleId, "manual-review/resolved-contract");
  assert.deepEqual(review.allow, allow);
  assert.match(review.message, /Runtime spender and bounded approval amount/);
  assert.ok(checkResolvedContractDeclarations([updated, entry], "field", binding).some((issue) => issue.severity === "blocking"));

  const approval = `const runtime = await sdk.resolveContract("${VAULT_ASSEMBLY_ID}", []);
    await sdk.simulateContract({ contract: runtime, abi, functionName: "approve", args: [runtime.address, amount] });`;
  assert.deepEqual(checkResolvedContractSource(approval, "Component.tsx", [binding]), []);
  assert.ok(checkResolvedContractSource(approval, "Component.tsx", [{ ...binding, resolvedContracts: [declaration] }]).some((issue) => issue.severity === "blocking"));
  assert.ok(checkResolvedContractSource(approval.replace("contract: runtime,", "contract: runtime, address: token,"), "Component.tsx", [binding]).some((issue) => issue.severity === "blocking"));

  for (const unsupported of [
    "function approve(address spender,uint256 amount)",
    "function approve(address spender,uint256 amount) returns (uint256)",
    "function openFarmStake(uint256 tier) returns (uint256)",
    "function buyFuel(uint256 id,uint256 tier,uint256 maximumCost) returns (uint256)",
    "function createFarm(string name,uint256 expectedBurnCost,string logoCID,address recipient) returns (uint256)",
    "function execute(address,uint256,bytes)",
  ]) {
    assert.throws(() => parseResolvedContract({ ...declaration, allow: [...declaration.allow, unsupported] }), /invalid-assembly-writes/);
  }
  assert.throws(() => parseResolvedContract({ ...entry, allow: [tokenActions[0]] }), /forbidden-write/);
});

test("Vault assembly accepts the exact declared farm actions and the complete 17-method profile", () => {
  for (const action of farmActions) {
    const name = action.match(/^function ([^(]+)/)[1];
    const updated = { ...declaration, allow: [...declaration.allow, action] };
    assert.deepEqual(parseResolvedContract(updated).writes.map((method) => method.name), ["commitTapeout", "revealTapeout", name]);
    const binding = { chainId: 97, factoryAddress: "0x123", resolvedContracts: [updated] };
    const [review] = checkResolvedContractDeclarations([updated], "field", binding);
    if (["createFarm", "upgradeFarm"].includes(name)) assert.match(review.message, /Runtime spender and bounded approval amount/);
    else assert.doesNotMatch(review.message, /Token spending requires/);
    const source = `const runtime = await sdk.resolveContract("${VAULT_ASSEMBLY_ID}", []);
      await sdk.simulateContract({ contract: runtime, abi, functionName: "${name}", args });`;
    assert.deepEqual(checkResolvedContractSource(source, "Component.tsx", [binding]), []);
    assert.ok(checkResolvedContractSource(source, "Component.tsx", [{ ...binding, resolvedContracts: [declaration] }]).some((issue) => issue.severity === "blocking"));
    assert.throws(() => parseResolvedContract({ ...updated, allow: [...updated.allow, action] }), /invalid-assembly-writes/);
    for (const mutability of ["view", "payable"]) {
      const invalid = action.includes(" returns") ? action.replace(" returns", ` ${mutability} returns`) : `${action} ${mutability}`;
      assert.throws(() => parseResolvedContract({ ...declaration, allow: [...declaration.allow, invalid] }), /invalid-assembly-writes/);
    }
  }

  const allow = [...declaration.allow, verifyMiner, ...tokenActions, ...farmActions].reverse();
  const updated = { ...declaration, allow };
  const binding = { chainId: 97, factoryAddress: "0x123", resolvedContracts: [updated] };
  assert.equal(allow.length, 17);
  assert.equal(parseResolvedContract(updated).writes.length, 17);
  const [review] = checkResolvedContractDeclarations([updated], "field", binding);
  assert.equal(review.ruleId, "manual-review/resolved-contract");
  assert.deepEqual(review.allow, allow);
  assert.match(review.message, /createFarm, upgradeFarm, joinFarm, exitFarm/);
  assert.throws(() => parseResolvedContract({ ...updated, allow: [...allow, "function createFarm(string,uint256,string,uint256) returns (uint256)"] }), /invalid-assembly-writes/);
  assert.throws(() => parseResolvedContract({ ...entry, allow: Array.from({ length: 17 }, (_, index) => `function claim${index}()`) }), /invalid-allow/);

  for (const invalid of [
    "function createFarm(string,uint256,string)",
    "function createFarm(string,uint256,string) returns (bool)",
    "function upgradeFarm(uint256) returns (uint256)",
    "function joinFarm(uint256,address)",
    "function joinFarm(uint256,uint256) returns (bool)",
    "function exitFarm(uint256,address)",
    "function exitFarm(uint256) returns (uint256)",
  ]) {
    assert.throws(() => parseResolvedContract({ ...declaration, allow: [...declaration.allow, invalid] }), /invalid-assembly-writes/);
  }
});

test("Vault assembly retains the existing reviewed UI's exact 13-method subset", () => {
  const selected = ["approve", "openFarmStakeAmount", "buyFuel", "claimFarmProduction", "claimRewards", "claimStakePrincipal"];
  const allow = [
    ...declaration.allow,
    verifyMiner,
    ...tokenActions.filter((method) => selected.some((name) => method.startsWith(`function ${name}(`))),
    ...farmActions,
  ];
  const updated = { ...declaration, allow };
  const binding = { chainId: 97, factoryAddress: "0x123", resolvedContracts: [updated] };
  const parsed = parseResolvedContract(updated);
  assert.equal(allow.length, 13);
  assert.equal(parsed.writes.length, 13);
  assert.deepEqual(parsed.definition.allow, allow);
  assert.equal(checkResolvedContractDeclarations([updated], "field", binding)[0].ruleId, "manual-review/resolved-contract");
  assert(!parsed.writes.some((method) => ["openFarmStake", "claimMiner", "claimMany", "claimStakeReward"].includes(method.name)));
});

test("Vault assembly compares nested claim return types recursively", () => {
  const [claimMany, claimRewards] = tokenActions.slice(-2);
  for (const invalid of [
    claimMany.replace("uint64 asOf", "uint256 asOf"),
    claimMany.replace("uint256[] amounts", "address[] amounts"),
    claimMany.replace("address token,", ""),
    claimMany.replace("asOfBlock))", "asOfBlock)[])"),
    claimRewards.replace("uint256[] ids", "bytes32[] ids"),
    claimRewards.replace("uint256 total) stakes", "uint64 total) stakes"),
    claimRewards.replace("uint256 total) farms", "uint256 total,bool extra) farms"),
  ]) {
    assert.throws(() => parseResolvedContract({ ...declaration, allow: [...declaration.allow, invalid] }), /invalid-assembly-writes/);
  }
});
test("declarations still reject other execution methods, approvals, dynamic calldata and invalid resolver/check/value rules",()=>{
 for(const patch of [
  {resolver:"function poolOf(uint256) returns(address)"},{resolver:"function poolOf(uint256) view returns(address,uint256)"},{resolver:"function poolOf() view returns(address)"},
  ...["Execute(uint256)","executeCall(address,uint256,bytes)","executeBatch(address[],bytes[])","multicall(bytes[])","delegatecall(address,bytes)","approve(address,uint256)","setApprovalForAll(address,bool)","upgradeTo(address)","run(bytes)","run((bytes data)[] calls)"].map(x=>({allow:[`function ${x}`]})),
  {payable:true},{checks:["arbitrary expression"]},{checks:[{kind:"ownerOf",target:"resolved",resolverArg:8}]},{allow:[]},{codeHash:"0x123"}
 ]) assert.throws(()=>parseResolvedContract({...entry,...patch}));
 assert.doesNotThrow(()=>parseResolvedContract(entry));
 const binding={chainId:56,factoryAddress:"0x123",resolvedContracts:[entry]};
 assert.equal(checkResolvedContractDeclarations([entry],"field",binding)[0].ruleId,"manual-review/resolved-contract");
 assert.equal(checkResolvedContractDeclarations([entry,entry],"field",binding)[1].severity,"blocking");
});
test("explicit execute signatures accept nested calldata and always retain human review evidence",()=>{
 for(const signature of ["function execute(address target,uint256 value,bytes data,uint8 operation) payable returns(bytes)","function execute(address,uint256,bytes)","function execute((address target,bytes data)[] calls)"]){
  const declared={...entry,allow:[signature]};
  assert.equal(parseResolvedContract(declared).writes[0].name,"execute");
  const review=checkResolvedContractDeclarations([declared],"field",{chainId:56,factoryAddress:"0x123"});
  assert.equal(review.length,1);assert.equal(review[0].severity,"warning");
  assert.equal(review[0].ruleId,"manual-review/resolved-contract");
  assert.deepEqual(review[0].allow,[signature]);assert.match(review[0].message,/nested targets/);
 }
 assert.throws(()=>parseResolvedContract({...entry,allow:["function execute(bytes) view returns(bytes)"]}),/forbidden-write/);
});
test("call tracing accepts declared genuine API shape and blocks unknown ids/methods/raw overrides",()=>{
 const binding={chainId:56,factoryAddress:"0x123",resolvedContracts:[entry]};
 const code='const position = await sdk.resolveContract("position", [id]); await sdk.writeContract({contract:position,abi,functionName:"claim",args:[amount]});';
 assert.deepEqual(checkResolvedContractSource(code,"Component.tsx",[binding]),[]);
 for(const bad of [code.replace('"position",','"other",'),code.replace('functionName:"claim"','functionName:"steal"'),code.replace('contract:position,','contract:position,address:target,'),code.replace('const position = await sdk.resolveContract("position", [id]);','const position = fake;')]) assert(checkResolvedContractSource(bad,"Component.tsx",[binding]).some(x=>x.severity==="blocking"));
});
test("execute source calls must trace to a resolver whose allow list explicitly declares execute",()=>{
 const code='const position = await sdk.resolveContract("position", [id]); await sdk.simulateContract({contract:position,abi,functionName:"execute",args:[target,0n,data,0]}); await sdk.writeContract({contract:position,abi,functionName:"execute",args:[target,0n,data,0]});';
 const binding={chainId:56,factoryAddress:"0x123",resolvedContracts:[{...entry,allow:["function execute(address,uint256,bytes,uint8)"]}]};
 assert.deepEqual(checkResolvedContractSource(code,"Component.tsx",[binding]),[]);
 assert(checkResolvedContractSource(code,"Component.tsx",[{...binding,resolvedContracts:[entry]}]).some(x=>x.severity==="blocking"));
 for(const bad of [code.replace('const position = await sdk.resolveContract("position", [id]);','const position = fake;'),code.replace('contract:position,','contract:position,address:target,'),code.replace('functionName:"execute"','functionName:method')]) assert(checkResolvedContractSource(bad,"Component.tsx",[binding]).some(x=>x.severity==="blocking"));
});
