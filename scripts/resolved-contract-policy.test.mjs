import assert from "node:assert/strict";
import test from "node:test";
import { parseResolvedContract } from "../src/sdk/resolvedContractPolicy.mjs";
import { checkResolvedContractDeclarations,checkResolvedContractSource } from "./resolved-contract-policy.mjs";
const entry={id:"position",label:"nft",resolver:"function poolOf(uint256 round) view returns(address)",allow:["function claim(uint256 amount)"]};
test("declarations reject execution, approvals, dynamic calldata and invalid resolver/check/value rules",()=>{
 for(const patch of [
  {resolver:"function poolOf(uint256) returns(address)"},{resolver:"function poolOf(uint256) view returns(address,uint256)"},{resolver:"function poolOf() view returns(address)"},
  ...["execute(address,uint256,bytes,uint8)","executeCall(address,uint256,bytes)","executeBatch(address[],bytes[])","approve(address,uint256)","setApprovalForAll(address,bool)","upgradeTo(address)","run(bytes)"].map(x=>({allow:[`function ${x}`]})),
  {payable:true},{checks:["arbitrary expression"]},{checks:[{kind:"ownerOf",target:"resolved",resolverArg:8}]},{allow:[]},{codeHash:"0x123"}
 ]) assert.throws(()=>parseResolvedContract({...entry,...patch}));
 assert.doesNotThrow(()=>parseResolvedContract(entry));
 const binding={chainId:56,factoryAddress:"0x123",resolvedContracts:[entry]};
 assert.equal(checkResolvedContractDeclarations([entry],"field",binding)[0].ruleId,"manual-review/resolved-contract");
 assert.equal(checkResolvedContractDeclarations([entry,entry],"field",binding)[1].severity,"blocking");
});
test("call tracing accepts declared genuine API shape and blocks unknown ids/methods/raw overrides",()=>{
 const binding={chainId:56,factoryAddress:"0x123",resolvedContracts:[entry]};
 const code='const position = await sdk.resolveContract("position", [id]); await sdk.writeContract({contract:position,abi,functionName:"claim",args:[amount]});';
 assert.deepEqual(checkResolvedContractSource(code,"Component.tsx",[binding]),[]);
 for(const bad of [code.replace('"position",','"other",'),code.replace('functionName:"claim"','functionName:"steal"'),code.replace('contract:position,','contract:position,address:target,'),code.replace('const position = await sdk.resolveContract("position", [id]);','const position = fake;')]) assert(checkResolvedContractSource(bad,"Component.tsx",[binding]).some(x=>x.severity==="blocking"));
});
