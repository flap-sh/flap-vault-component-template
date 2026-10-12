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
const tmp = await mkdtemp(path.join(os.tmpdir(), "flap-copy-button-"));
let browser, server;
try {
 const ui = consumerFlag < 0 ? "./src/ui/CopyButton" : "@flapsdk/vault-runtime/ui";
 const sdk = consumerFlag < 0 ? "./src/sdk/miniAppRuntime" : "@flapsdk/vault-runtime/sdk";
 const host = consumerFlag < 0 ? "./src/sdk/runtime" : "@flapsdk/vault-runtime/host";
 const entry = `import * as React from "react";
 import { createRoot } from "react-dom/client";
 import { CopyButton } from ${JSON.stringify(ui)};
 import { MiniAppRuntimeProvider } from ${JSON.stringify(sdk)};
 import { VaultRuntimeProvider } from ${JSON.stringify(host)};
 if (typeof CopyButton !== "function") throw new Error("Upgrade the shared runtime to the release containing CopyButton.");
 const root = createRoot(document.getElementById("root"));
 const token = "0x286184b2660a2822671a33f24c4517f593947777";
 const manifest = { artifactId:"vaultui_copy-test_01ARZ3NDEKTSV4RRFFQ69G5FAV", name:"Copy", i18n:["en","zh","ko"], match:{bindings:[{chainId:56,tokenAddresses:[token]}]} };
 const app = {...manifest,schemaVersion:2,mode:"mini-app",appModel:"standalone",slug:"copy-test",match:{bindings:[]}};
 const session={isConnected:false,isAuthenticated:false,isLoading:false,connect(){},async signIn(){}};
 globalThis.notifications=[];
 const notify=Object.fromEntries(["info","success","warning","error"].map(key=>[key,(message)=>notifications.push({key,message})]));
 globalThis.renderCopy=(mode="app",locale="en",value=token,disabled=false,label)=>{
 const i18n={locale,t:(key,fallback)=>fallback||key};
 const button=React.createElement(CopyButton,{value,disabled,label});
 const tree=mode==="app"?React.createElement(MiniAppRuntimeProvider,{manifest:app,session,i18n,notify},button):React.createElement(VaultRuntimeProvider,{manifest,i18n:{en:{},zh:{},ko:{}},locale,runtimeContext:{chainId:56,tokenAddress:token}},button);
 root.render(React.createElement(React.StrictMode,null,tree));};
 globalThis.renderCopy();`;
 const wagmi = `const noop=()=>{}; const chains=[{id:56,name:"BNB"}];
 export const useAccount=()=>({isConnected:false}); export const useConfig=()=>({chains});
 export const useChainId=()=>56; export const useBalance=()=>({});
 export const usePublicClient=()=>undefined; export const useWalletClient=()=>({});
 export const useConnect=()=>({connect:noop,connectors:[]}); export const useDisconnect=()=>({disconnect:noop});
 export const useSwitchChain=()=>({switchChainAsync:async()=>{},isPending:false});`;
 await build({absWorkingDir:ROOT,stdin:{contents:entry,resolveDir:ROOT,sourcefile:"copy-harness.tsx",loader:"tsx"},outfile:path.join(tmp,"app.js"),bundle:true,format:"esm",platform:"browser",jsx:"automatic",plugins:[{name:"wallet-fixture",setup(b){
 b.onResolve({filter:/^wagmi$/},()=>({path:"wagmi",namespace:"fixture"}));
 b.onResolve({filter:/^@rainbow-me\/rainbowkit$/},()=>({path:"rainbow",namespace:"fixture"}));
 b.onResolve({filter:/^@\/src\/ui$/},()=>({path:"ui",namespace:"fixture"}));
 b.onLoad({filter:/.*/,namespace:"fixture"},({path})=>({contents:path==="wagmi"?wagmi:path==="rainbow"?'export const useConnectModal=()=>({openConnectModal:()=>{}});':'export const Alert=()=>null;',loader:"js"}));
 }}]});
 server=createServer(async(req,res)=>{res.setHeader("Content-Type",req.url==="/app.js"?"text/javascript":"text/html");res.end(req.url==="/app.js"?await readFile(path.join(tmp,"app.js")):'<button id="fullscreen" onclick="document.getElementById(\'root\').requestFullscreen()">Fullscreen</button><div id="root"></div><script type="module" src="/app.js"></script>');});
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({permissions:["clipboard-read","clipboard-write"]});
 const page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const button=page.locator('[data-flap-ui="copy-button"]');
 await button.waitFor();
 await button.click();
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),"0x286184b2660a2822671a33f24c4517f593947777");
 const render=async(mode,locale="en",value="0x123",disabled=false,label)=>{await page.evaluate(args=>renderCopy(...args),[mode,locale,value,disabled,label]);await page.waitForTimeout(40);};
 const state=async(expected)=>page.waitForFunction(value=>document.querySelector('[data-flap-ui="copy-button"]')?.dataset.flapCopyState===value,expected);
 await page.evaluate(()=>{
  globalThis.writes=[];globalThis.copyMode="ok";
  Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async value=>{writes.push(value);if(copyMode==="pending")await new Promise(r=>{globalThis.releaseCopy=r;});if(copyMode==="denied")throw new Error("Denied");}}});
  document.execCommand=()=>{globalThis.fallbackParent=document.querySelector("textarea")?.parentElement===document.fullscreenElement;globalThis.fallbackValue=document.querySelector("textarea")?.value;return globalThis.fallbackOk;};
 });
 for(const mode of ["vault","app"]){
  await render(mode);
  await page.evaluate(()=>{writes.length=0;document.querySelector('[data-flap-ui="copy-button"]').click();});
  assert.equal(await page.evaluate(()=>writes.length),0,"Synthetic clicks must not copy");
  await button.click();await state("copied");
  assert.deepEqual(await page.evaluate(()=>writes),["0x123"]);
  await render(mode,"en"," 0x456 ");await button.focus();await page.keyboard.press("Enter");await state("copied");
  assert.equal(await page.evaluate(()=>writes.at(-1))," 0x456 ","Copy exactly the displayed value");
  for(const invalid of [""," ","x".repeat(4097),"a\0b"]){await render(mode,"en",invalid);assert.equal(await button.isDisabled(),true);}
  await render(mode,"en","0x789",true);assert.equal(await button.isDisabled(),true);
  await render(mode,"zh-CN","0xabc");assert.equal(await button.getAttribute("aria-label"),"复制");
  await render(mode,"ko","0xdef");assert.equal(await button.getAttribute("aria-label"),"복사");
  await render(mode,"en","pending");await page.evaluate(()=>copyMode="pending");await button.click();await state("copying");assert.equal(await button.isDisabled(),true);
  await page.evaluate(()=>releaseCopy());await state("copied");
  await page.evaluate(()=>{copyMode="denied";globalThis.fallbackOk=true;});
  await render(mode,"en","fallback");await button.click();await state("copied");
  assert.equal(await page.evaluate(()=>fallbackValue),"fallback");assert.equal(await page.locator("textarea").count(),0);assert.equal(await button.evaluate(el=>el===document.activeElement),true);
  await render(mode,"en","fullscreen");await page.locator("#fullscreen").click();await page.waitForFunction(()=>!!document.fullscreenElement);await button.click();await state("copied");
  assert.equal(await page.evaluate(()=>fallbackParent),true);await page.evaluate(()=>document.exitFullscreen());
  await render(mode,"en","failure");await page.evaluate(()=>{fallbackOk=false;notifications.length=0;});await button.click();await state("failed");
  assert.match(await button.getAttribute("aria-label"),/Could not copy/);
  if(mode==="app")assert.deepEqual(await page.evaluate(()=>notifications.map(n=>n.key)),["error"]);
  await page.evaluate(()=>copyMode="ok");await render(mode,"en","changed");await button.click();await state("copied");assert.equal(await page.evaluate(()=>writes.at(-1)),"changed");
 }
 // A late result must not update an unmounted component or report success.
 await render("app","en","unmount");await page.evaluate(()=>{copyMode="pending";notifications.length=0;});await button.click();await state("copying");
 await page.evaluate(()=>{renderCopy("vault","en","replacement");});await page.waitForTimeout(40);await page.evaluate(()=>releaseCopy());await page.waitForTimeout(40);
 assert.deepEqual(await page.evaluate(()=>notifications),[]);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({ok:true,consumer:ROOT,surfaces:["Vault UI","Mini App v2"],checks:["real clipboard","trusted click","keyboard","exact value","invalid/disabled","en/zh/ko","pending","fallback","focus restore","fullscreen","failure","changed value","unmount"]}));
}finally{await browser?.close();await new Promise(r=>server?server.close(r):r());await rm(tmp,{recursive:true,force:true});}
