import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
const { build } = createRequire(import.meta.resolve("tsup"))("esbuild");
const compiled = await build({ entryPoints: [new URL("./tsTimeline.ts", import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "esm" });
const { TsTimeline } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}`);
function timestamp(value, prefix = 0x20) {
  return [prefix | ((Math.floor(value / 2 ** 29) & 14)) | 1, Math.floor(value / 2 ** 22) & 255, (Math.floor(value / 2 ** 14) & 254) | 1, Math.floor(value / 128) & 255, ((value % 128) << 1) | 1];
}
function packet(clock, { dts, pcr = clock, split = false, payloadSize = 12 } = {}) {
  const result = new Uint8Array(188).fill(255);
  result.set([0x47, 0x41, 0, 0x30, split ? 183 - payloadSize : 7, 0x10]);
  result.set([Math.floor(pcr / 2 ** 25) & 255, Math.floor(pcr / 2 ** 17) & 255, Math.floor(pcr / 512) & 255, Math.floor(pcr / 2) & 255, ((pcr % 2) << 7) | 0x7e, 0], 6);
  const header = Uint8Array.from([0, 0, 1, 0xe0, 0, 0, 0x80, dts === undefined ? 0x80 : 0xc0, dts === undefined ? 5 : 10, ...timestamp(clock, dts === undefined ? 0x20 : 0x30), ...(dts === undefined ? [] : timestamp(dts, 0x10))]);
  const start = 5 + result[4];
  result.set(header.slice(0, 188-start), start);
  if (!split) return result;
  const next = new Uint8Array(188).fill(255); next.set([0x47, 1, 0, 0x11]); next.set(header.slice(188-start), 4);
  return Uint8Array.from([...result, ...next]);
}
function pts(bytes, at) { return (bytes[at] & 14)*2**29 + bytes[at+1]*2**22 + (bytes[at+2]&254)*2**14 + bytes[at+3]*128 + (bytes[at+4]>>1); }
test("aligns restarted PTS, DTS and PCR to provider time without changing encoded payload", () => {
  const input = packet(99000, {dts:90000, pcr:90000});
  const out = new TsTimeline(34000).push(input, true);
  assert.equal(pts(out, 21), 34000*90+9000);
  assert.equal(pts(out, 26), 34000*90);
  const expected = packet(34000*90+9000, {dts:34000*90, pcr:34000*90});
  assert.deepEqual(out, expected);
});
test("handles network chunks and PES timestamps split across TS packets", () => {
  const input = packet(90000, {split:true});
  const timeline = new TsTimeline(8000);
  assert.equal(timeline.push(input.slice(0,193)).length, 0);
  const out = timeline.push(input.slice(193), true);
  const header = Uint8Array.from([...out.slice(176,188), ...out.slice(192,194)]);
  assert.equal(pts(header,9), 8000*90);
});
test("handles 33-bit clock rollover and rejects malformed/truncated transport packets", () => {
  const out = new TsTimeline((2**33+90000)/90).push(packet(90000), true);
  assert.equal(pts(out, 21), 90000);
  assert.throws(() => new TsTimeline(0).push(new Uint8Array(188), true));
  assert.throws(() => new TsTimeline(0).push(packet(0).slice(0,180), true));
});


test("recognizes PES prefixes split across packets", () => {
  const input = packet(90000, {split:true, payloadSize:2});
  const out = new TsTimeline(16000).push(input, true);
  const header = Uint8Array.from([...out.slice(186,188), ...out.slice(192,204)]);
  assert.equal(pts(header,9), 16000*90);
});
