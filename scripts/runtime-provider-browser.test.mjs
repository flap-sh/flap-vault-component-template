#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
const ROOT=process.cwd();
const { build }=createRequire(import.meta.resolve("tsup"))("esbuild");
const tmp=await mkdtemp(path.join(os.tmpdir(),"flap-runtime-provider-"));
let server,browser;
try {
 const entry=`import * as React from "react";
import {createRoot} from "react-dom/client";
import {VaultRuntimeProvider} from "./src/sdk/runtime";
import {useFlapSdk} from "./src/sdk/runtimeStore";
import {encodeFunctionResult,parseAbi} from "viem";
const a=(i)=>'0x'+i.toString(16).padStart(40,'0');
const state={user:a(9),chain:56,sends:0,changeOnSimulation:false,simulations:0,target:a(5)};
const client={getChainId:async()=>56,getBlockNumber:async()=>100n,getCode:async()=>"0x6000",getGasPrice:async()=>1n,
 readContract:async({functionName})=>functionName==='poolOf'?state.target:state.user,
 simulateContract:async()=>{if(state.changeOnSimulation && ++state.simulations % 2 === 0)state.user=a(8);return{result:1n};}};
const walletClient={getAddresses:async()=>[state.user],getChainId:async()=>state.chain,writeContract:async()=>{state.sends++;return a(20);}};
globalThis.env={state,client,walletClient};
const manifest={artifactId:'test',i18n:['en'],match:{bindings:[{chainId:56,factoryAddress:a(1),resolvedContracts:[{id:'position',label:'nft',resolver:'function poolOf(uint256 id) view returns(address)',allow:['function claim(uint256 amount)'],checks:[{kind:'owner',target:'resolved'}]}]}]}};
let context={chainId:56,factoryAddress:a(1),vaultAddress:a(2),tokenAddress:a(3),host:{taxInfo:{quoteToken:a(4)}}};
globalThis.hostContext=context;
const i18n={en:{}};
function Probe(){globalThis.sdk=useFlapSdk();React.useEffect(()=>{globalThis.providerRenders=(globalThis.providerRenders||0)+1;});return null;}
const root=createRoot(document.getElementById('root'));
globalThis.renderProvider=(nextContext=context)=>{context=nextContext;globalThis.hostContext=context;root.render(React.createElement(VaultRuntimeProvider,{manifest,i18n,runtimeContext:context},React.createElement(Probe)));};
globalThis.rerenderProvider=async(nextContext=context)=>{const before=globalThis.providerRenders;renderProvider(nextContext);while(globalThis.providerRenders===before)await new Promise(requestAnimationFrame);};
globalThis.readOwner=(read=sdk.readContract,address=context.host.taxInfo.quoteToken,extra={})=>read({address,abi:parseAbi(['function owner() view returns(address)']),functionName:'owner',...extra});
globalThis.encodeOwner=(owner)=>encodeFunctionResult({abi:parseAbi(['function owner() view returns(address)']),functionName:'owner',result:owner});
globalThis.testWrite=async()=>{const handle=await sdk.resolveContract('position',[1n]);const prepared=await sdk.simulateContract({contract:handle,abi:parseAbi(['function claim(uint256 amount)']),functionName:'claim',args:[1n]});return sdk.writeContract(prepared.request);};
globalThis.renderProvider();`;
 const wagmi=`export const useAccount=()=>({address:globalThis.env.state.user,isConnected:true});
const config={chains:[{id:56,name:"BNB"}]}; export const useConfig=()=>config;
export const useChainId=()=>globalThis.env.state.chain;
const connect=()=>{};const connectors=[];const disconnect=()=>{};const switchChainAsync=async()=>{};
export const useConnect=()=>({connect,connectors});export const useDisconnect=()=>({disconnect});
export const useSwitchChain=()=>({switchChainAsync,isPending:false});
export const usePublicClient=()=>globalThis.env.client;export const useWalletClient=()=>({data:globalThis.env.walletClient});
export const useBalance=()=>({data:undefined});`;
 await build({absWorkingDir:ROOT,stdin:{contents:entry,resolveDir:ROOT,sourcefile:'provider-harness.tsx',loader:'tsx'},outfile:path.join(tmp,'app.js'),bundle:true,format:'esm',platform:'browser',jsx:'automatic',plugins:[{name:'provider-fixtures',setup(b){b.onResolve({filter:/^wagmi$/},()=>({path:'wagmi',namespace:'fixture'}));b.onResolve({filter:/^@\/src\/ui$/},()=>({path:'ui',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='wagmi'?wagmi:'export const Alert=()=>null;',loader:'js'}));}}]});
 server=createServer(async(req,res)=>{res.setHeader('Content-Type',req.url==='/app.js'?'text/javascript':'text/html');res.end(req.url==='/app.js'?await readFile(path.join(tmp,'app.js')):'<div id="root"></div><script type="module" src="/app.js"></script>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>globalThis.sdk);
 const identity=await page.evaluate(async()=>{const first=sdk;sdk.notify.info('test');await new Promise(r=>setTimeout(r,30));return sdk===first;});assert(identity,'Provider notification must not rebuild SDK when default policies are absent');
 // Retained read callbacks must use the latest authorization context and RPC client.
 const readStability=await page.evaluate(async()=>{
  const first=sdk.readContract;globalThis.savedRead=first;
  const original=await readOwner(first);
  const handle=await sdk.resolveContract('position',[1n]);
  const request={contract:handle,abi:[{type:'function',name:'owner',stateMutability:'view',inputs:[],outputs:[{type:'address'}]}],functionName:'owner'};
  await first(request);
  await rerenderProvider({...hostContext,host:{...hostContext.host,marketPhase:'dex-listed',taxInfo:{quoteToken:'0x'+(6).toString(16).padStart(40,'0')}}});
  let revoked;try{await first(request);revoked='allowed';}catch(e){revoked=e.message;}
  let currentHandle;try{currentHandle=await first({...request,contract:await sdk.resolveContract('position',[1n])});}catch(e){currentHandle=e.message;}
  return {stable:first===sdk.readContract,original,current:await readOwner(first),revoked,currentHandle};
 });
 assert.equal(readStability.stable,true,'Host context updates must preserve sdk.readContract identity');
 assert.equal(readStability.original,readStability.current);
 assert.equal(readStability.currentHandle,readStability.current);
 assert.match(readStability.revoked,/forged-or-expired-handle/,'Retained callbacks must not accept handles from an obsolete authorization context');
 const clientStability=await page.evaluate(async()=>{
  const originalClient=env.client;const owner='0x'+(7).toString(16).padStart(40,'0');
  env.client={...originalClient,readContract:async()=>owner,call:async()=>({data:encodeOwner(owner)})};
  await rerenderProvider();
  const result={stable:savedRead===sdk.readContract,owner,read:await readOwner(savedRead),call:await readOwner(savedRead,undefined,{gasPrice:1n})};
  env.client=undefined;await rerenderProvider();
  try{await readOwner(savedRead);result.unavailable='allowed';}catch(e){result.unavailable=e.message;}
  result.stableWhileUnavailable=savedRead===sdk.readContract;
  env.client=originalClient;await rerenderProvider();return result;
 });
 assert.equal(clientStability.stable,true);assert.equal(clientStability.stableWhileUnavailable,true);
 assert.equal(clientStability.read,clientStability.owner);assert.equal(clientStability.call,clientStability.owner);
 assert.match(clientStability.unavailable,/client-unavailable/);
 // A host update during validation must not mix authorization from one client with another RPC.
 const inFlight=await page.evaluate(async()=>{
  const originalClient=env.client;const context=hostContext;
  let entered,release;const started=new Promise(r=>{entered=r;});
  const previousOwner='0x'+(10).toString(16).padStart(40,'0');const nextOwner='0x'+(11).toString(16).padStart(40,'0');
  env.client={...originalClient,getBlockNumber:()=>{entered();return new Promise(r=>{release=r;});},readContract:async()=>previousOwner};
  await rerenderProvider();const pending=readOwner(savedRead);await started;
  env.client={...originalClient,readContract:async()=>nextOwner};await rerenderProvider();release(100n);
  const result={previous:await pending,current:await readOwner(savedRead),previousOwner,nextOwner};
  await rerenderProvider({...context,chainId:97});
  try{await readOwner(savedRead);result.wrongChain='allowed';}catch(e){result.wrongChain=e.message;}
  env.client=originalClient;await rerenderProvider(context);return result;
 });
 assert.equal(inFlight.previous,inFlight.previousOwner);assert.equal(inFlight.current,inFlight.nextOwner);
 assert.match(inFlight.wrongChain,/chain-changed/);
 const pending=await page.evaluate(async()=>{const p={policyId:'none',tokenId:1n,amount:1n};return Promise.allSettled([sdk.withdrawNftAccount(p),sdk.withdrawNftAccount(p)]).then(r=>r.map(x=>x.reason?.message));});assert.match(pending[0],/policy-not-approved/);assert.match(pending[1],/withdrawal-pending/);
 assert.match(await page.evaluate(()=>testWrite()),/^0x/);assert.equal(await page.evaluate(()=>env.state.sends),1);
 const denied=await page.evaluate(async()=>{env.state.changeOnSimulation=true;try{await testWrite();return 'sent';}catch(e){return e.message;}});assert.match(denied,/wallet-or-chain-changed|ownership-check-failed/);assert.equal(await page.evaluate(()=>env.state.sends),1);
 const isolated=await page.evaluate(()=>{sdk.context.host.taxInfo.quoteToken='0x'+(88).toString(16).padStart(40,'0');return hostContext.host.taxInfo.quoteToken!==sdk.context.host.taxInfo.quoteToken;});assert(isolated,'Component context must not mutate host authorization inputs');
 assert.deepEqual(errors,[]);console.log('Provider browser checks passed: stable SDK/read identity, latest read authorization/client, consistent in-flight client, unavailable/wrong-chain rejection, pending guard, genuine simulated handle, wallet switch before send, isolated host authorization context.');
} finally {await browser?.close();if(server)await new Promise(r=>server.close(r));await rm(tmp,{recursive:true,force:true});}
