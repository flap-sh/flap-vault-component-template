import assert from "node:assert/strict";
import test from "node:test";
import { parseResolvedContract } from "../src/sdk/resolvedContractPolicy.mjs";
import { checkResolvedContractDeclarations,checkResolvedContractSource } from "./resolved-contract-policy.mjs";
const entry={id:"position",label:"nft",resolver:"function poolOf(uint256 round) view returns(address)",allow:["function claim(uint256 amount)"]};
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
