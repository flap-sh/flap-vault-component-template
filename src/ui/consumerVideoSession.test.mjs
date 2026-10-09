import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
const { build } = createRequire(import.meta.resolve("tsup"))("esbuild");
const compiled = await build({ stdin: { contents: 'export * from "./consumerVideoSession"; export * from "../sdk/videoSession";', resolveDir: new URL(".", import.meta.url).pathname }, bundle: true, write: false, platform: "node", format: "esm" });
const { ConsumerVideoSession, resolveVideoClipIndex, videoClipPosition, createConsumerVideoSessionReader, VIDEO_WINDOW_SIZE, VideoSessionReadError } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}`);
const CID = "bafkreigo6g3mkveu5w3l7ud56qr4oq3sa62hawcdmybdhbi5agurqwm5ye";
const CONSUMER = "0x1234567890123456789012345678901234567890";
function clips(length) {
  let pts = 10000000000000000n;
  return Array.from({ length }, (_, index) => {
    const durationMs = index % 2 ? 9000 : 8000;
    const clip = { index, videoCid: CID, lastFrameCid: "", durationMs, startPtsMs: pts, requestId: BigInt(index), createdAt: 1n, referenceType: 4 };
    pts += BigInt(durationMs);
    return clip;
  });
}
function fixture(length = 1000, override = {}) {
  const values = clips(length);
  const calls = [];
  const states = [];
  let reads = 0;
  const reader = { readLength: async () => { reads++; return values.length; }, readSlice: async (start, count) => { calls.push([start, count]); return values.slice(start, start + count); }, ...override };
  const session = new ConsumerVideoSession(reader, state => states.push(state));
  return { values, calls, states, session, reader, get lengthReads() { return reads; } };
}

test("resolves Python-style indices and clamps valid out-of-range indices", () => {
  assert.equal(resolveVideoClipIndex(0, 1000), 0);
  assert.equal(resolveVideoClipIndex(500, 1000), 500);
  assert.equal(resolveVideoClipIndex(-1, 1000), 999);
  assert.equal(resolveVideoClipIndex(-2, 1000), 998);
  assert.equal(resolveVideoClipIndex(-2000, 1000), 0);
  assert.equal(resolveVideoClipIndex(2000, 1000), 999);
  assert.equal(resolveVideoClipIndex(-1, 0), null);
  for (const index of [NaN, Infinity, 0.5, "1"]) assert.throws(() => resolveVideoClipIndex(index, 1000));
});

test("starting at clip 500 reads one bounded slice; starting at -1 reads one final clip", async () => {
  for (const [start, expected, count] of [[500, 500, VIDEO_WINDOW_SIZE], [-1, 999, 1], [-2, 998, 2]]) {
    const f = fixture();
    await f.session.refresh(start);
    assert.deepEqual(f.calls, [[0, 1], [999, 1], [expected, count]]);
    assert.equal(f.states.at(-1).clips[0].index, expected);
    assert.equal(f.states.at(-1).state, "ready");
    f.session.dispose();
  }
});

test("polls only length, appends new tail metadata, and does not keep jumping from startClip=-1", async () => {
  const f = fixture(4);
  await f.session.refresh(-1);
  const original = f.states.at(-1).clips;
  await f.session.refresh();
  assert.equal(f.states.at(-1).clips, original);
  assert.deepEqual(f.calls, [[0, 1], [3, 1], [3, 1]]);
  f.values.push(clips(5)[4]);
  await f.session.refresh();
  assert.equal(f.states.at(-1).start, 3);
  assert.deepEqual(f.calls, [[0, 1], [3, 1], [3, 1], [0, 1], [4, 1]]);
  await f.session.advance(3);
  assert.deepEqual(f.calls, [[0, 1], [3, 1], [3, 1], [0, 1], [4, 1], [4, 1]]);
  assert.equal(f.states.at(-1).clips.length, 2);
  assert.equal(f.states.at(-1).preservePosition, true);
  f.session.dispose();
});

test("rolling windows reuse cached metadata and stay bounded through a thousand clips", async () => {
  const f = fixture();
  await f.session.refresh();
  for (let index = 2; index < 998; index += 2) {
    await f.session.advance(index);
    assert.ok(f.states.at(-1).clips.length <= VIDEO_WINDOW_SIZE);
    assert.equal(f.states.at(-1).start, index);
  }
  assert.ok(f.calls.every(([, count]) => count <= VIDEO_WINDOW_SIZE));
  const oldCalls = f.calls.length;
  await f.session.seek(0);
  assert.equal(f.calls.length, oldCalls + 1, "old cache entries must be evicted rather than grow forever");
  f.session.dispose();
});

test("outdated seeks cannot replace the latest selection or resurrect an unmounted session", async () => {
  const f = fixture();
  await f.session.refresh();
  let resolve;
  f.reader.readSlice = (start, count) => start === 500 ? new Promise(done => { resolve = () => done(f.values.slice(start, start + count)); }) : Promise.resolve(f.values.slice(start, start + count));
  const first = f.session.seek(500, 0, true);
  await f.session.seek(800, 0, false);
  resolve(); await first;
  assert.equal(f.states.at(-1).start, 800);
  assert.equal(f.states.at(-1).play, false);
  const pending = f.session.seek(500);
  f.session.dispose();
  const last = f.states.at(-1);
  // Clip 500 may already be cached; either outcome must stay quiet after dispose.
  if (resolve) resolve();
  await pending;
  assert.equal(f.states.at(-1), last);
});

test("PTS differences handle unequal durations and very large absolute timestamps", () => {
  const window = clips(505).slice(500, 504);
  assert.deepEqual(videoClipPosition(window, 9.5), { index: 501, time: 1.5, duration: 9 });
  assert.deepEqual(videoClipPosition(window, 17), { index: 502, time: 0, duration: 8 });
  assert.deepEqual(videoClipPosition(window, -5), { index: 500, time: 0, duration: 8 });
});

test("empty sessions, shrink/reset, malformed ranges and transient refresh failures stay explicit", async () => {
  const empty = fixture(0);
  await empty.session.refresh(-1);
  assert.equal(empty.states.at(-1).state, "empty");
  empty.values.push(clips(1)[0]);
  await empty.session.refresh();
  assert.equal(empty.states.at(-1).start, 0);
  const f = fixture();
  await f.session.refresh(900);
  f.reader.readLength = async () => { throw new Error("offline"); };
  await f.session.refresh();
  assert.equal(f.states.at(-1).state, "ready");
  assert.equal(f.states.at(-1).refreshFailed, true);
  f.reader.readLength = async () => 2;
  await f.session.refresh();
  assert.equal(f.states.at(-1).start, 1);
  const invalid = fixture(4, { readSlice: async () => [] });
  await invalid.session.refresh();
  assert.equal(invalid.states.at(-1).state, "invalid");
  for (const item of [empty, f, invalid]) item.session.dispose();
});

test("failed window extension keeps current playback and does not retry on every timeupdate", async () => {
  const f = fixture();
  await f.session.refresh();
  const original = f.states.at(-1).clips;
  let failures = 0;
  f.reader.readSlice = async () => { failures++; throw new Error("offline"); };
  await f.session.advance(2);
  await f.session.advance(2);
  assert.equal(failures, 1);
  assert.equal(f.states.at(-1).clips, original);
  f.session.dispose();
});

test("the shared SDK owns mainnet/testnet provider addresses and bounds metadata reads", async () => {
  for (const [chainId, provider] of [[56, "0xaEe3a7Ca6fe6b53f6c32a3e8407eC5A9dF8B7E39"], [97, "0xFfddcE44e8cFf7703Fd85118524bfC8B2f70b744"]]) {
    const calls = [];
    const sdk = { context: { chainId }, readContract: async request => { calls.push(request); return request.functionName === "getVideoSessionLength" ? 1000n : clips(501).slice(500); } };
    const reader = createConsumerVideoSessionReader(sdk, CONSUMER);
    assert.equal(await reader.readLength(), 1000);
    assert.equal((await reader.readSlice(500, 1))[0].index, 500);
    assert.ok(calls.every(call => call.address === provider));
    assert.deepEqual(calls[1].args, [CONSUMER, 500n, 1n]);
    await assert.rejects(reader.readSlice(0, 1000), VideoSessionReadError);
    assert.equal(calls.length, 2);
  }
  const noRead = { readContract: async () => { throw new Error("must not read"); } };
  await assert.rejects(createConsumerVideoSessionReader({ ...noRead, context: { chainId: 4663 } }, CONSUMER).readLength(), error => error.code === "unsupported");
  for (const consumer of ["0x0000000000000000000000000000000000000000", "bad-address"]) await assert.rejects(createConsumerVideoSessionReader({ ...noRead, context: { chainId: 56 } }, consumer).readLength(), error => error.code === "invalid");
});


test("metadata rolling and unchanged polling never change stream revision or origin", async () => {
  const f = fixture();
  await f.session.refresh();
  const initial = f.states.at(-1);
  await f.session.advance(2);
  await f.session.advance(4);
  await f.session.refresh();
  const current = f.states.at(-1);
  assert.equal(current.revision, initial.revision);
  assert.equal(current.mediaStartPtsMs, initial.mediaStartPtsMs);
  assert.deepEqual(videoClipPosition(current.clips, 36, current.mediaStartPtsMs), { index: 4, time: 2, duration: 8 });
  f.session.dispose();
});

test("global timeline seek uses bounded binary search with variable durations and huge PTS", async () => {
  const f = fixture();
  await f.session.refresh();
  await f.session.seekTime(4252, false);
  assert.equal(f.states.at(-1).start, 500);
  assert.equal(f.states.at(-1).resumeAt, 2);
  assert.equal(f.states.at(-1).play, false);
  assert.ok(f.calls.length < 16);
  assert.ok(f.calls.every(([, count]) => count <= 4));
  f.session.dispose();
});

test("tail loader waits for appended clips, and cancellation/dispose release pending reads", async () => {
  const f = fixture(4);
  await f.session.refresh();
  const controller = new AbortController();
  const pending = f.session.readClip(4, controller.signal);
  f.values.push(clips(5)[4]);
  await f.session.refresh();
  assert.equal((await pending).index, 4);
  const cancelled = f.session.readClip(5, controller.signal);
  controller.abort();
  await assert.rejects(cancelled, { name: "AbortError" });
  const disposed = f.session.readClip(5, new AbortController().signal);
  f.session.dispose();
  await assert.rejects(disposed, { name: "AbortError" });
});


test("a stale event cannot advance outside the current metadata window", async () => {
  const f = fixture(); await f.session.refresh(501);
  const current = f.states.at(-1);
  await f.session.advance(999);
  assert.equal(f.states.at(-1), current);
  const second = fixture(); await second.session.refresh(501);
  assert.notEqual(second.states.at(-1).sessionId, current.sessionId);
  f.session.dispose(); second.session.dispose();
});
