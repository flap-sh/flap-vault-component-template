import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
const consumerFlag = process.argv.indexOf("--consumer");
const ROOT = consumerFlag < 0 ? process.cwd() : path.resolve(process.argv[consumerFlag + 1]);
const { build } = createRequire(path.join(ROOT, "package.json"))("esbuild");
const tmp = await mkdtemp(path.join(os.tmpdir(), "flap-ipfs-content-"));
let browser, server;
try {
 const ui = consumerFlag < 0 ? "./src/ui" : "@flapsdk/vault-runtime/ui";
 const sdk = consumerFlag < 0 ? "./src/sdk/client" : "@flapsdk/vault-runtime/sdk";
 const host = consumerFlag < 0 ? "./src/sdk/runtime" : "@flapsdk/vault-runtime/host";
 const entry = `import * as React from "react";
 import { createRoot } from "react-dom/client";
 import { IpfsText, IpfsImage } from ${JSON.stringify(ui)};
 import { useFlapSdk, MiniAppRuntimeProvider } from ${JSON.stringify(sdk)};
 import { VaultRuntimeProvider } from ${JSON.stringify(host)};
 const root = createRoot(document.getElementById("root"));
 const token = "0x286184b2660a2822671a33f24c4517f593947777";
 const manifest = {artifactId:"vaultui_ipfs-test_01ARZ3NDEKTSV4RRFFQ69G5FAV",name:"IPFS",i18n:["en"],match:{bindings:[{chainId:56,tokenAddresses:[token]}]}};
 const app = {...manifest,schemaVersion:2,mode:"mini-app",appModel:"standalone",slug:"ipfs-test",match:{bindings:[]}};
 const session={isConnected:false,isAuthenticated:false,isLoading:false,connect(){},async signIn(){}};
 const runtime={chains:[{id:56,name:"BNB"}],readOnly:true,getAccount:()=>({isConnected:false})};
 function Content({mode,cid}) {
  const sdk=mode==="app"?useFlapSdk({chainId:56}):useFlapSdk();
  const [value,setValue]=React.useState({cid:null,text:""});
  React.useEffect(()=>{let active=true;sdk.readIpfsText(cid).then(text=>{if(active)setValue({cid,text});},()=>{if(active)setValue({cid,text:"rejected"});});return()=>{active=false;};},[sdk,cid]);
  return <><output data-sdk-text>{value.cid===cid?value.text:"loading"}</output><IpfsText cid={cid} fallback="fallback" data-ui-text/><IpfsImage cid={cid} alt="dynamic"/></>;
 }
 globalThis.renderContent=(mode,cid,connected=false)=>{
 const child=<Content mode={mode} cid={cid}/>;
 const i18n={locale:"en",t:(key,fallback)=>fallback||key};
 const tree=mode==="app"?<MiniAppRuntimeProvider manifest={app} session={{...session,isConnected:connected}} i18n={i18n} notify={{}} runtime={runtime}>{child}</MiniAppRuntimeProvider>:<VaultRuntimeProvider manifest={manifest} i18n={{en:{}}} locale="en" runtimeContext={{chainId:56,tokenAddress:token}}>{child}</VaultRuntimeProvider>;
 root.render(tree);};`;
 const wagmi = `const noop=()=>{}; const chains=[{id:56,name:"BNB"}];
 export const useAccount=()=>({isConnected:false}); export const useConfig=()=>({chains});
 export const useChainId=()=>56; export const useBalance=()=>({});
 export const usePublicClient=()=>undefined; export const useWalletClient=()=>({});
 export const useConnect=()=>({connect:noop,connectors:[]}); export const useDisconnect=()=>({disconnect:noop});
 export const useSwitchChain=()=>({switchChainAsync:async()=>{},isPending:false});`;
 await build({absWorkingDir:ROOT,stdin:{contents:entry,resolveDir:ROOT,sourcefile:"ipfs-content-harness.tsx",loader:"tsx"},outfile:path.join(tmp,"app.js"),bundle:true,format:"esm",platform:"browser",jsx:"automatic",plugins:[{name:"wallet-fixture",setup(b){
 b.onResolve({filter:/^wagmi$/},()=>({path:"wagmi",namespace:"fixture"}));
 b.onResolve({filter:/^@rainbow-me\/rainbowkit$/},()=>({path:"rainbow",namespace:"fixture"}));
 b.onResolve({filter:/^@\/src\/ui$/},()=>({path:"ui",namespace:"fixture"}));
 b.onLoad({filter:/.*/,namespace:"fixture"},({path})=>({contents:path==="wagmi"?wagmi:path==="rainbow"?'export const useConnectModal=()=>({openConnectModal:()=>{}});':'export const Alert=()=>null;',loader:"js"}));
 }}]});
 server=createServer(async(req,res)=>{res.setHeader("Content-Type",req.url==="/app.js"?"text/javascript":"text/html");res.end(req.url==="/app.js"?await readFile(path.join(tmp,"app.js")):'<button id="fullscreen" onclick="document.getElementById(\'root\').requestFullscreen()">Fullscreen</button><div id="root"></div><script type="module" src="/app.js"></script>');});
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext();
 const page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
 const cid="bafkreicllrojftwdwi7gukkpydxkimru55isnrngj5ggyuy2zbbqvmfyiq";
 const second="bafkreidozepkxwqggu4oyj2bjakr75c26vks2727yqqpkrkygcfmq2snvq";
 let requests=0;
 await page.route("https://**/ipfs/**",async route=>{
   requests++;
   const request=route.request();
   if(request.resourceType()==="image")return route.fulfill({contentType:"image/png",body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ZkAAAAASUVORK5CYII=","base64")});
   assert.equal(request.method(),"GET");assert.equal(request.headers().cookie,undefined);
   return route.fulfill({contentType:"text/plain; charset=utf-8",body:request.url().includes(second)?"updated text":"<b>你好 🌍</b>"});
 });
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 for(const [mode,connected] of [["vault",false],["app",false],["app",true]]){
   await page.evaluate(args=>renderContent(...args),[mode,cid,connected]);
   await page.waitForFunction(()=>document.querySelector("[data-ui-text]")?.textContent==="<b>你好 🌍</b>"&&document.querySelector("[data-sdk-text]")?.textContent==="<b>你好 🌍</b>");
   assert.equal(await page.locator("b").count(),0);
   assert.match(await page.locator("img").getAttribute("src"),new RegExp(`/ipfs/${cid}$`));
   await page.evaluate(args=>renderContent(...args),[mode,second,connected]);
   await page.waitForFunction(()=>document.querySelector("[data-ui-text]")?.textContent==="updated text"&&document.querySelector("[data-sdk-text]")?.textContent==="updated text");
   await page.waitForFunction(()=>{const image=document.querySelector("img");return image?.complete&&image.naturalWidth>0;});
   const before=requests;
   await page.evaluate(args=>renderContent(...args),[mode,"https://invalid.example/image",connected]);
   await page.waitForFunction(()=>document.querySelector("[data-ui-text]")?.dataset.flapIpfsTextState==="error"&&document.querySelector("[data-sdk-text]")?.textContent==="rejected");
   assert.equal(await page.locator("img").count(),0);assert.equal(requests,before);
 }
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({ok:true,consumer:ROOT,surfaces:["Vault UI","Mini App v2 guest","Mini App v2 connected"],checks:["chain SDK readIpfsText","shared IpfsText provider","escaped HTML","dynamic CID update","invalid CID without network","controlled image URL"]}));
}finally{await browser?.close();await new Promise(r=>server?server.close(r):r());await rm(tmp,{recursive:true,force:true});}
