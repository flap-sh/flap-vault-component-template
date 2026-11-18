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
