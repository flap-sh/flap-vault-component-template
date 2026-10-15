#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
const ROOT=process.cwd();
const packaged=process.argv.includes('--package');
const providerEntrypoint=packaged?'./dist/vault-runtime/host-client.js':'./src/sdk/runtime';
const sdkEntrypoint=packaged?'./dist/vault-runtime/sdk.js':'./src/sdk/runtimeStore';
const imageEntrypoint=packaged?'./dist/vault-runtime/ui.js':'./src/ui/IpfsImage';
const textEntrypoint=packaged?'./dist/vault-runtime/ui.js':'./src/ui/IpfsText';
function fixtureCid(bytes) {
 const data=Buffer.concat([Buffer.from([1,0x55,0x12,0x20]),createHash('sha256').update(bytes).digest()]);
 let bits=0,value=0,result='b';
 for(const byte of data){value=(value<<8)|byte;bits+=8;while(bits>=5){result+='abcdefghijklmnopqrstuvwxyz234567'[(value>>>(bits-5))&31];bits-=5;}}
 if(bits)result+='abcdefghijklmnopqrstuvwxyz234567'[(value<<(5-bits))&31];
 return result;
}
const { build }=createRequire(import.meta.resolve("tsup"))("esbuild");
const tmp=await mkdtemp(path.join(os.tmpdir(),"flap-runtime-provider-"));
let server,browser;
try {
 const entry=`import * as React from "react";
import {createRoot} from "react-dom/client";
import {VaultRuntimeProvider} from "${providerEntrypoint}";
import {useFlapSdk} from "${sdkEntrypoint}";
import {IpfsImage} from "${imageEntrypoint}";
import {IpfsText} from "${textEntrypoint}";
import {encodeFunctionResult,parseAbi} from "viem";
const a=(i)=>'0x'+i.toString(16).padStart(40,'0');
const state={user:a(9),chain:56,sends:0,changeOnSimulation:false,simulations:0,target:a(5)};
const client={getChainId:async()=>56,getBlockNumber:async()=>100n,getCode:async()=>"0x6000",getGasPrice:async()=>1n,
 readContract:async({functionName})=>functionName==='poolOf'?state.target:state.user,
 simulateContract:async()=>{if(state.changeOnSimulation && ++state.simulations % 2 === 0)state.user=a(8);return{result:1n};}};
const walletClient={getAddresses:async()=>[state.user],getChainId:async()=>state.chain,writeContract:async()=>{state.sends++;return a(20);}};
globalThis.env={state,client,walletClient};
const manifest={artifactId:'test',i18n:['en'],match:{bindings:[{chainId:56,factoryAddress:a(1),resolvedContracts:[{id:'position',label:'nft',resolver:'function poolOf(uint256 id) view returns(address)',allow:['function claim(uint256 amount)','function execute(address,uint256,bytes,uint8) payable returns(bytes)'],checks:[{kind:'owner',target:'resolved'}]}]}]}};
globalThis.hostManifest=manifest;
let context={chainId:56,factoryAddress:a(1),vaultAddress:a(2),tokenAddress:a(3),host:{taxInfo:{quoteToken:a(4)}}};
globalThis.hostContext=context;
const i18n={en:{}};
function Probe(){globalThis.sdk=useFlapSdk();React.useEffect(()=>{globalThis.providerRenders=(globalThis.providerRenders||0)+1;});return globalThis.ipfsProps?React.createElement('div',{id:'ipfs-content'},React.createElement(IpfsText,{cid:ipfsProps.textCid,...ipfsProps.textOverrides}),React.createElement(IpfsImage,{cid:ipfsProps.imageCid,alt:'post',...ipfsProps.imageOverrides})):null;}
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
 // Generate our own content-addressed fixtures through the actual SDK upload flow.
 const assets=new Map();let ipfsRequests=0;let unrelatedRequests=0;
 await page.route('**/api/runtime/upload',async route=>{
  const request=route.request();
  const form=await new Response(request.postDataBuffer(),{headers:{'content-type':request.headers()['content-type']}}).formData();
  const file=form.get('file');const body=Buffer.from(await file.arrayBuffer());const cid=fixtureCid(body);
  assets.set(cid,{body,contentType:file.type});await route.fulfill({json:{data:{cid}}});
 });
 await page.route('https://*.mypinata.cloud/ipfs/**',async route=>{
  ipfsRequests++;const cid=new URL(route.request().url()).pathname.split('/')[2];const asset=assets.get(cid);
  if(asset?.contentType==='image/png' && route.request().url().startsWith('https://flap.mypinata.cloud/') && !globalThis.firstImageFixture)globalThis.firstImageFixture=cid;
  if(cid===globalThis.firstImageFixture && route.request().url().startsWith('https://flap.mypinata.cloud/'))return route.fulfill({status:404});
  await route.fulfill(asset?{body:asset.body,contentType:asset.contentType,headers:{'access-control-allow-origin':'*'}}:{status:404});
 });
 await page.route('https://unrelated.example/**',route=>{unrelatedRequests++;return route.abort();});
 const uploaded=await page.evaluate(async()=>{
  const text='<img src=x onerror="globalThis.injected=true">你好 🌍';
  const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3e8AAAAASUVORK5CYII='),c=>c.charCodeAt(0));
  globalThis.pngFixture=png;
  const post=await sdk.uploadText(text);const image=await sdk.uploadImage(new Blob([png],{type:'image/png'}));
  globalThis.savedIpfsRead=sdk.readIpfsText;
  globalThis.ipfsProps={textCid:post.cid,imageCid:image.cid,textOverrides:{dangerouslySetInnerHTML:{__html:'<script>bad</script>'}},imageOverrides:{srcSet:'https://unrelated.example/image 1x'}};
  await rerenderProvider();
  return {text,textCid:post.cid,imageCid:image.cid};
 });
 await page.waitForSelector('[data-flap-ipfs-text-state="ready"]');
 await page.waitForFunction(()=>document.querySelector('#ipfs-content img')?.naturalWidth>0);
 assert.match(await page.locator('#ipfs-content img').getAttribute('src'),/^https:\/\/magenta-naval-penguin-822\.mypinata\.cloud\//);
 assert.equal(await page.locator('[data-flap-ipfs-text-state]').textContent(),uploaded.text);
 assert.equal(await page.locator('[data-flap-ipfs-text-state] img, [data-flap-ipfs-text-state] script').count(),0);
 assert.equal(await page.locator('#ipfs-content img').getAttribute('srcset'),null);
 assert.equal(await page.locator('#ipfs-content img').getAttribute('referrerpolicy'),'no-referrer');
 const second=await page.evaluate(async()=>{
  const post=await sdk.uploadText('Second post');
  const image=await sdk.uploadImage(new Blob([pngFixture,Uint8Array.of(1)],{type:'image/png'}));
  globalThis.ipfsProps={...ipfsProps,textCid:post.cid,imageCid:image.cid};await rerenderProvider();
  return {stable:savedIpfsRead===sdk.readIpfsText,cid:post.cid,text:await savedIpfsRead(post.cid)};
 });
 assert(second.stable,'IPFS reader must remain stable across host/UI updates');
 assert.equal(second.text,'Second post');
 await page.waitForFunction(()=>document.querySelector('[data-flap-ipfs-text-state]')?.textContent==='Second post');
 await page.waitForFunction(()=>document.querySelector('#ipfs-content img')?.naturalWidth>0);
 assert.match(await page.locator('#ipfs-content img').getAttribute('src'),/^https:\/\/flap\.mypinata\.cloud\//);
 const beforeInvalid=ipfsRequests;
 const rejectedIpfs=await page.evaluate(async()=>{try{await sdk.readIpfsText('https://unrelated.example/file');return false;}catch{return true;}});
 assert(rejectedIpfs);assert.equal(ipfsRequests,beforeInvalid);assert.equal(unrelatedRequests,0);
 await page.evaluate(async()=>{globalThis.ipfsProps=undefined;await rerenderProvider();});
 // FSI authorization comes from the host manifest, never the component's copy.
 let fsiRequests=0;
 await page.route('https://bsc-debug.butterfly.army/fsi/v1/**', route=>{fsiRequests++;return route.fulfill({json:{items:[],nextCursor:'a/b+c=='}});});
 const fsi=await page.evaluate(async()=>{
  const saved=sdk.readFsi;
  sdk.context.manifest.endpoints='https://bsc-debug.butterfly.army/fsi/v1';
  let forged;try{await saved('by-key/account',{templateId:'G'});forged='allowed';}catch(e){forged=e.message;}
  hostManifest.endpoints='https://bsc-debug.butterfly.army/fsi/v1';
  await rerenderProvider({...hostContext});
  const rejectedPaths=[];
  for(const path of ['vault/%2e%2e/other/G','vault/.%2e/other/G','vault/%2E/G','%2e%2e/v1/other/G','vault/%2fG']){
   try{await saved(path);rejectedPaths.push('allowed');}catch(e){rejectedPaths.push(e.message);}
  }
  const result=await saved('by-key/account',{templateId:'G',cursor:'a/b+c=='});
  delete hostManifest.endpoints;
  await rerenderProvider({...hostContext});
  let revoked;try{await saved('by-key/account');revoked='allowed';}catch(e){revoked=e.message;}
  return {stable:saved===sdk.readFsi,forged,revoked,result,rejectedPaths};
 });
 assert(fsi.stable,'FSI callback must remain stable across host updates');
 assert.match(fsi.forged,/manifest.endpoints/);
 assert.match(fsi.revoked,/manifest.endpoints/);
 assert.deepEqual(fsi.result,{items:[],nextCursor:'a/b+c=='});
 fsi.rejectedPaths.forEach(message=>assert.match(message,/FSI path traversal/));
 assert.equal(fsiRequests,1,'Rejected FSI paths must never reach the network');
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
 const execution=await page.evaluate(async()=>{
  const abi=[{type:'function',name:'execute',stateMutability:'payable',inputs:[{type:'address'},{type:'uint256'},{type:'bytes'},{type:'uint8'}],outputs:[{type:'bytes'}]}];
  const handle=await sdk.resolveContract('position',[1n]);
  const request={contract:handle,abi,functionName:'execute',args:[hostContext.tokenAddress,0n,'0x12345678',0]};
  const prepared=await sdk.simulateContract(request);
  const simulated=await sdk.writeContract(prepared.request);
  const direct=await sdk.writeContract(request);
  const failures={};
  const denied=async(key,call)=>{try{await call();failures[key]='allowed';}catch(e){failures[key]=e.message;}};
  // A component cannot expand the host manifest's reviewed allow list.
  sdk.context.manifest.match.bindings[0].resolvedContracts[0].allow.push('function execute(address,uint256,bytes)');
  for(const method of ['simulateContract','writeContract']){
   await denied(method+'Raw',()=>sdk[method]({...request,contract:undefined,address:hostContext.vaultAddress}));
   await denied(method+'Forged',()=>sdk[method]({...request,contract:{...handle}}));
   await denied(method+'Overload',()=>sdk[method]({...request,abi:[{...abi[0],inputs:abi[0].inputs.slice(0,3)}],args:request.args.slice(0,3)}));
   await denied(method+'Value',()=>sdk[method]({...request,value:1n}));
  }
  return {simulated,direct,failures,sends:env.state.sends};
 });
 assert.match(execution.simulated,/^0x/);assert.match(execution.direct,/^0x/);assert.equal(execution.sends,2);
 for(const method of ['simulateContract','writeContract']){
  assert.match(execution.failures[method+'Raw'],/use-restricted-entry/);
  assert.match(execution.failures[method+'Forged'],/forged-or-expired-handle/);
  assert.match(execution.failures[method+'Overload'],/selector-not-allowed/);
  assert.match(execution.failures[method+'Value'],/value-not-allowed/);
 }
 assert.match(await page.evaluate(()=>testWrite()),/^0x/);assert.equal(await page.evaluate(()=>env.state.sends),3);
 const denied=await page.evaluate(async()=>{env.state.changeOnSimulation=true;try{await testWrite();return 'sent';}catch(e){return e.message;}});assert.match(denied,/wallet-or-chain-changed|ownership-check-failed/);assert.equal(await page.evaluate(()=>env.state.sends),3);
 const isolated=await page.evaluate(()=>{sdk.context.host.taxInfo.quoteToken='0x'+(88).toString(16).padStart(40,'0');return hostContext.host.taxInfo.quoteToken!==sdk.context.host.taxInfo.quoteToken;});assert(isolated,'Component context must not mutate host authorization inputs');
 assert.deepEqual(errors,[]);console.log('Provider browser checks passed ('+(packaged?'package':'source')+'): stable SDK/read identity, latest authorization/client, reviewed execute simulation/write, raw/forged/undeclared-overload/value rejection, pending guard, wallet switch before send, isolated host authorization context.');
} finally {await browser?.close();if(server)await new Promise(r=>server.close(r));await rm(tmp,{recursive:true,force:true});}
