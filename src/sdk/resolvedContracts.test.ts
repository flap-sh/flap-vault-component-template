import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, parseAbi } from "viem";
import type { PublicClient } from "viem";
import type { Address, VaultManifest, VaultRuntimeContext } from "./types";
import type { ManifestResolvedContract } from "./resolvedContractTypes";
// @ts-expect-error Node runner needs the source extension.
import { createResolvedContractRuntime, isEip6551Proxy } from "./resolvedContracts.ts";

const a = (i: number) => `0x${i.toString(16).padStart(40,"0")}` as Address;
const definition: ManifestResolvedContract = { id: "position", label: "nft", resolver: "function poolOf(uint256 round) view returns (address)", allow: ["function claim(uint256 amount,address to)"], read: ["function pending() view returns (uint256)"], codeHash: keccak256("0x6000"), checks: [{kind:"owner",target:"resolved"},{kind:"recipient",function:"function claim(uint256 amount,address to)",arg:1},{kind:"balance",function:"function claim(uint256 amount,address to)",amountArg:0,token:"resolved",owner:"resolved"}] };
function fixture(custom = definition, targetPolicy: "strict" | "warn" = "strict") {
  custom = structuredClone(custom);
  const state = { address:a(5), user:a(9), chain:56, code:"0x6000" as `0x${string}`, owner:a(9), balance:100n, blocks:0, warnings:0, seen:[] as bigint[] };
  const client = { getChainId:async()=>state.chain, getBlockNumber:async()=>BigInt(++state.blocks), getCode:async()=>state.code,
    readContract:async({functionName,blockNumber}:{functionName:string;blockNumber:bigint})=>{ state.seen.push(blockNumber); return functionName==="poolOf" ? state.address : functionName==="balanceOf" ? state.balance : state.owner; }
  } as unknown as PublicClient;
  const manifest = {artifactId:"artifact",match:{bindings:[{chainId:56,factoryAddress:a(1),resolvedContracts:[custom]}]}} as VaultManifest;
  const context = {chainId:56,factoryAddress:a(1),vaultAddress:a(2),tokenAddress:a(3)} as VaultRuntimeContext;
  const make = () => createResolvedContractRuntime({client,manifest,context,targetPolicy,getWallet:async()=>({address:state.user,chainId:state.chain}),warn:()=>{state.warnings++;}});
  const runtime = make();
  const request = (contract: Awaited<ReturnType<typeof runtime.resolveContract>>) => ({contract,abi:parseAbi(custom.allow),functionName:"claim",args:[50n,a(9)]});
  return {state,runtime,make,manifest,context,request};
}

test("genuine frozen handles resolve at the Vault and revalidate all checks at one block",async()=>{
 const f=fixture(); const args=[12n]; const handle=await f.runtime.resolveContract("position",args); args[0]=99n;
 assert.deepEqual(handle.args,[12n]); assert(Object.isFrozen(handle.args)); assert(Object.isFrozen(handle));
 const prepared=f.runtime.snapshot(f.request(handle)); const checked=await f.runtime.validate(prepared,true);
 assert.equal(checked.sender,a(9)); assert.equal(checked.request.address,a(5)); assert.equal(checked.blockNumber,2n);
 assert.deepEqual(f.state.seen,[1n,2n,2n,2n]);
});
test("forged, cloned, cross-runtime and handle+address requests fail closed",async()=>{
 const f=fixture(); const h=await f.runtime.resolveContract("position",[1n]);
 for(const fake of [{...h},structuredClone(h)]) assert.throws(()=>f.runtime.snapshot(f.request(fake)),/forged/);
 assert.throws(()=>f.make().snapshot(f.request(h)),/expired/);
 assert.throws(()=>f.runtime.snapshot({...f.request(h),address:a(5)}),/handle-with-address/);
});
test("post-resolution address, code, owner, wallet, chain and balance changes are rejected",async()=>{
 for(const change of [
  (f:ReturnType<typeof fixture>)=>{f.state.address=a(6);},(f:ReturnType<typeof fixture>)=>{f.state.code="0x6001";},
  (f:ReturnType<typeof fixture>)=>{f.state.owner=a(6);},(f:ReturnType<typeof fixture>)=>{f.state.user=a(6);},
  (f:ReturnType<typeof fixture>)=>{f.state.chain=97;},(f:ReturnType<typeof fixture>)=>{f.state.balance=1n;}
 ]) { const f=fixture();const h=await f.runtime.resolveContract("position",[1n]);const p=f.runtime.snapshot(f.request(h));change(f); await assert.rejects(f.runtime.validate(p,true,a(9))); }
});
test("wrong selector, native value, recipient and read function are denied",async()=>{
 const f=fixture(); const h=await f.runtime.resolveContract("position",[1n]);
 for(const patch of [{abi:parseAbi(["function steal(uint256,address)"]),functionName:"steal"},{value:1n},{args:[50n,a(8)]}]) await assert.rejects(f.runtime.validate(f.runtime.snapshot({...f.request(h),...patch}),true));
 await assert.rejects(f.runtime.validate(f.runtime.snapshot({contract:h,abi:parseAbi(["function owner() view returns(address)"]),functionName:"owner"}),false),/selector/);
});
test("snapshot defeats mutation across asynchronous lookup and uses host-owned binding copies",async()=>{
 const f=fixture();const h=await f.runtime.resolveContract("position",[1n]);const r=f.request(h);const p=f.runtime.snapshot(r);
 r.args[0]=999n;f.context.vaultAddress=a(77);f.manifest.match.bindings[0].resolvedContracts![0].allow=["function steal()"];
 assert.equal((await f.runtime.validate(p,true)).request.args?.[0],50n);
});
test("raw writes are allowed only to the active host/binding targets; labels grant nothing",async()=>{
 const f=fixture();const r={contract:"nft",address:a(99),abi:parseAbi(["function claim()"]),functionName:"claim"};
 await assert.rejects(f.runtime.validate(f.runtime.snapshot(r),true),/unapproved-raw-target/);
 await f.runtime.validate(f.runtime.snapshot({...r,address:a(2)}),true);
 const w=fixture(structuredClone(definition),"warn");await w.runtime.validate(w.runtime.snapshot(r),true);assert.equal(w.state.warnings,1);
});
test("a valid EIP-6551 proxy cannot use a generic write even when its address is declared",async()=>{
 const f=fixture();f.state.code=`0x363d3d373d3d3d363d73${a(4).slice(2)}5af43d82803e903d91602b57fd5bf3${"00".repeat(128)}`;
 assert(isEip6551Proxy(f.state.code)); assert(!isEip6551Proxy("0x363d3d373d3d3d363d73"));
 await assert.rejects(f.runtime.validate(f.runtime.snapshot({address:a(2),abi:parseAbi(["function executeCall(address,uint256,bytes)"]),functionName:"executeCall",args:[a(3),0n,"0x"]}),true),/account-requires-profile/);
});
test("bounded payable methods, view reads and implementation pins are enforced",async()=>{
 const payable:ManifestResolvedContract={...structuredClone(definition),allow:["function claim(uint256 amount,address to) payable"],checks:[],payable:true,maxValueWei:"10",read:"any"};
 const f=fixture(payable);const h=await f.runtime.resolveContract("position",[1n]);await f.runtime.validate(f.runtime.snapshot({...f.request(h),value:10n}),true);
 await assert.rejects(f.runtime.validate(f.runtime.snapshot({...f.request(h),value:11n}),true));
 await f.runtime.validate(f.runtime.snapshot({contract:h,abi:parseAbi(["function pending() view returns(uint256)"]),functionName:"pending"}),false);
 await assert.rejects(f.runtime.validate(f.runtime.snapshot(f.request(h)),false),/read-not-view/);
 const bad=fixture({...structuredClone(definition),codeHash:undefined,codePattern:"eip6551-proxy"}); await assert.rejects(bad.runtime.resolveContract("position",[1n]),/code-pattern/);
});

test("implementation pins read actual implementation bytecode at the validation block", async () => {
 const proxy = `0x363d3d373d3d3d363d73${a(4).slice(2)}5af43d82803e903d91602b57fd5bf3${"00".repeat(128)}` as `0x${string}`;
 let implementationCode = "0x6001" as `0x${string}`;
 const reads: Array<{address:Address;blockNumber:bigint}> = [];
 const client = { getChainId:async()=>56,getBlockNumber:async()=>77n,
  readContract:async()=>a(5), getCode:async (request:{address:Address;blockNumber:bigint})=>{reads.push(request);return request.address===a(4)?implementationCode:proxy;} } as unknown as PublicClient;
 const runtime = createResolvedContractRuntime({client,manifest:{artifactId:"pinned",match:{bindings:[{chainId:56,factoryAddress:a(1),resolvedContracts:[{id:"pinned",label:"nft",resolver:"function poolOf(uint256) view returns(address)",allow:["function claim()"],codePattern:"eip6551-proxy",implementationCodeHash:keccak256(implementationCode)}]}]}} as VaultManifest,context:{chainId:56,factoryAddress:a(1),vaultAddress:a(2),tokenAddress:a(3)} as VaultRuntimeContext,getWallet:async()=>({address:a(9),chainId:56})});
 await runtime.resolveContract("pinned",[1n]);assert.deepEqual(reads,[{address:a(5),blockNumber:77n},{address:a(4),blockNumber:77n}]);
 implementationCode="0x6002";await assert.rejects(runtime.resolveContract("pinned",[1n]),/implementation-hash-mismatch/);
});
test("ownerOf checks and read overloads use the selected selector",async()=>{
 const f=fixture({...structuredClone(definition),checks:[{kind:"ownerOf",target:"resolved",resolverArg:0}],read:"any"});
 const h=await f.runtime.resolveContract("position",[12n]);await f.runtime.validate(f.runtime.snapshot(f.request(h)),true);
 const overloaded=parseAbi(["function pending() returns(uint256)","function pending(uint256) view returns(uint256)"]);
 await f.runtime.validate(f.runtime.snapshot({contract:h,abi:overloaded,functionName:"pending",args:[1n]}),false);
 await assert.rejects(f.runtime.validate(f.runtime.snapshot({contract:h,abi:overloaded,functionName:"pending",args:[]}),false),/read-not-view/);
});
