import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
const { build } = createRequire(import.meta.resolve("tsup"))("esbuild");
const compiled = await build({ entryPoints: [new URL("./continuousVideoLoader.ts", import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "esm" });
const { createContinuousVideoLoader } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}`);
const CID = "bafkreigo6g3mkveu5w3l7ud56qr4oq3sa62hawcdmybdhbi5agurqwm5ye";
class Video extends EventTarget { currentTime = 0; ended = false; buffered = { length: 0 }; }
const tick = () => new Promise(resolve => setImmediate(resolve));
const packet = new Uint8Array(188).fill(255);
packet.set([0x47,0x41,0,0x10,0,0,1,0xe0,0,0,0x80,0x80,5,0x21,0,1,0,1]);
function fixture() {
  const video = new Video(); const requests = []; const reads = [];
  const controller = new AbortController();
  const source = { revision:1, startIndex:499, startPtsMs:3992000n, resumeAt:0, firstVideoCid:CID, playIntent:()=>false,
    readClip:async (index, signal) => {
      reads.push(index);
      if(index>=504) await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
      return { index, videoCid:CID, startPtsMs:3992000n+BigInt(index-499)*8000n, durationMs:8000 };
    }};
  const Loader = createContinuousVideoLoader(source, video, async (url, options) => { requests.push({url,options}); return new Response(packet); });
  const loader = new Loader(); const arrivals = []; const errors = [];
  loader.onDataArrival = (bytes,offset) => arrivals.push({bytes,offset}); loader.onError = (...args)=>errors.push(args);
  loader.open({}, {from:0,to:-1});
  return {video,loader,requests,reads,arrivals,errors,controller};
}
test("streams only the selected and following clips with bounded preload, one byte stream and safe gateway requests", async()=> {
  const f=fixture(); for(let i=0;i<10;i++) await tick();
  assert.equal(f.requests.length,4);
  assert.ok(f.reads.every(i=>i>=499));
  assert.deepEqual(f.arrivals.filter(a=>a.bytes.byteLength).map(a=>a.offset),[0,188,376,564]);
  assert.ok(f.requests.every(r=>r.url.endsWith(CID)&&r.options.credentials==='omit'&&r.options.redirect==='error'));
  f.video.currentTime=8; f.video.dispatchEvent(new Event('timeupdate'));
  for(let i=0;i<10;i++) await tick();
  assert.equal(f.requests.length,5);
  f.loader.destroy(); await tick(); assert.deepEqual(f.errors,[]);
});
test("rejects byte-range seeks and aborts fetch/wait work on teardown", async()=> {
  const f=fixture(); f.loader.abort(); await tick();
  assert.equal(f.requests.length,0);
  f.loader.open({}, {from:188,to:-1}); assert.equal(f.errors.length,1);
  f.loader.destroy();
});
