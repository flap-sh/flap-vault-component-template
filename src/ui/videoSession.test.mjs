import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

// Use tsup's declared compiler dependency to exercise the actual source graph.
const { build } = createRequire(import.meta.resolve("tsup"))("esbuild");
const compiled = await build({ entryPoints: [new URL("./videoSession.ts", import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "esm" });
const { videoSessionSegments, VideoSessionController } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString("base64")}`);
const CID = "bafkreigo6g3mkveu5w3l7ud56qr4oq3sa62hawcdmybdhbi5agurqwm5ye";
const CID2 = "bafkreif7v4n5q7tfjpy3vuak24wo2pjdwob3td35sosiexv5d5o2myyiru";
const clips = [{ videoCid: CID, durationMs: 8000 }];
const extended = [...clips, { videoCid: CID2, durationMs: 9000 }];

class Video extends EventTarget {
  currentTime = 0;
  paused = true;
  ended = false;
  buffered = { length: 1, start: () => 0, end: () => 1000 };
}

function fixture({ supported = true, loadMpegts, failure } = {}) {
  const video = new Video();
  const players = [];
  const sources = [];
  const configs = [];
  const states = [];
  const library = {
    isSupported: () => supported,
    Events: { ERROR: "player-error" },
    createPlayer(source, config) {
      sources.push(source);
      configs.push(config);
      const handlers = new Map();
      const player = {
        destroyed: 0,
        played: 0,
        loaded: 0,
        currentTime: 0,
        on: (name, handler) => handlers.set(name, handler),
        off: (name) => handlers.delete(name),
        emit: (name) => handlers.get(name)?.(),
        attachMediaElement(element) {
          assert.equal(element, video);
          if (failure === "attach") throw new Error("attachment failed");
        },
        load() {
          player.loaded++;
          if (failure === "load") throw new Error("loading failed");
        },
        play() {
          player.played++;
          return Promise.reject(new Error("autoplay blocked"));
        },
        destroy() { player.destroyed++; video.currentTime = 0; },
      };
      players.push(player);
      return player;
    },
  };
  const controller = new VideoSessionController(video, loadMpegts || (async () => library), (state) => states.push(state));
  return { video, players, sources, configs, states, controller, library };
}

test("uses provider milliseconds and runtime-owned IPFS URLs, discarding caller URL fields", () => {
  assert.deepEqual(videoSessionSegments([{ ...clips[0], url: "https://evil.example/clip.ts" }]), [{
    url: `https://flap.mypinata.cloud/ipfs/${CID}`, duration: 8000,
  }]);
  assert.deepEqual(videoSessionSegments([]), []);
  for (const value of [null, {}, [null], [{ videoCid: 42, durationMs: 8000 }],
    ...[0, -1, Infinity, NaN, "8000", 0.5].map((durationMs) => [{ videoCid: CID, durationMs }]),
    ...["https://example.com/a.ts", `ipfs://${CID}`, `${CID}/../a`, `${CID}?x=1`, "b".repeat(129)].map((videoCid) => [{ videoCid, durationMs: 8000 }]),
  ]) assert.equal(videoSessionSegments(value), null);
});

test("keeps SSR/import evaluation free of browser globals and does not import for empty/invalid sessions", async () => {
  const f = fixture({ loadMpegts: () => { throw new Error("must not load"); } });
  await f.controller.update([]);
  await f.controller.update([{ videoCid: "invalid", durationMs: 8000 }]);
  assert.deepEqual(f.states, ["empty", "invalid"]);
  assert.equal(typeof globalThis.window, "undefined");
});

test("uses MSE without workers or credentials and ignores unchanged polling arrays", async () => {
  const f = fixture();
  await f.controller.update(clips);
  f.video.dispatchEvent(new Event("loadedmetadata"));
  assert.equal(f.sources[0].type, "mse");
  assert.equal(f.sources[0].withCredentials, false);
  assert.deepEqual(f.configs[0], { enableWorker: false, enableWorkerForMSE: false, accurateSeek: true, lazyLoadMaxDuration: 180, referrerPolicy: "no-referrer" });
  await f.controller.update(clips.map((clip) => ({ ...clip, requestId: 1n })));
  assert.equal(f.players.length, 1);
  assert.equal(f.players[0].played, 0);
  assert.equal(f.states.at(-1), "ready");
  f.controller.dispose();
  assert.equal(f.players[0].destroyed, 1);
});

test("appending preserves a paused viewer's position after new metadata is ready", async () => {
  const f = fixture();
  await f.controller.update(clips);
  f.video.currentTime = 3.5;
  await f.controller.update(extended);
  assert.equal(f.players[0].destroyed, 1);
  assert.equal(f.players[1].currentTime, 0);
  f.video.dispatchEvent(new Event("loadedmetadata"));
  assert.equal(f.players[1].currentTime, 3.5);
  assert.equal(f.players[1].played, 0);
  f.controller.dispose();
});

test("appending resumes a playing or ended session and tolerates autoplay rejection", async () => {
  for (const ended of [false, true]) {
    const f = fixture();
    await f.controller.update(clips);
    f.video.currentTime = 7;
    f.video.ended = ended;
    f.video.paused = ended;
    await f.controller.update(extended);
    f.video.dispatchEvent(new Event("loadedmetadata"));
    await Promise.resolve();
    assert.equal(f.players[1].currentTime, 7);
    assert.equal(f.players[1].played, 1);
    assert.equal(f.states.at(-1), "ready");
    f.controller.dispose();
  }
});

test("waits for the saved position to buffer before seeking and expands the lazy-load horizon", async () => {
  const f = fixture();
  await f.controller.update(clips);
  f.video.currentTime = 240;
  f.video.buffered = { length: 0, start: () => 0, end: () => 0 };
  await f.controller.update(extended);
  f.video.dispatchEvent(new Event("loadedmetadata"));
  assert.equal(f.players[1].currentTime, 0);
  assert.equal(f.states.at(-1), "loading");
  assert.equal(f.configs[1].lazyLoadMaxDuration, 270);
  f.video.buffered = { length: 1, start: () => 0, end: () => 250 };
  f.video.dispatchEvent(new Event("progress"));
  assert.equal(f.players[1].currentTime, 240);
  assert.equal(f.states.at(-1), "ready");
  f.players[1].currentTime = 245;
  f.video.dispatchEvent(new Event("progress"));
  assert.equal(f.players[1].currentTime, 245);
  f.controller.dispose();
});

test("replacing a session resets its position instead of seeking into unrelated content", async () => {
  const f = fixture();
  await f.controller.update(clips);
  f.video.currentTime = 5;
  f.video.paused = false;
  await f.controller.update([extended[1]]);
  f.video.dispatchEvent(new Event("loadedmetadata"));
  assert.equal(f.players[1].currentTime, 0);
  assert.equal(f.players[1].played, 0);
  f.controller.dispose();
});

test("explicit window revisions replace media immediately and retain native audio settings", async () => {
  const f = fixture();
  f.video.muted = true;
  f.video.volume = 0.3;
  await f.controller.update(extended, false, { revision: 1, resumeAt: 0 });
  f.video.currentTime = 9;
  await f.controller.update([extended[1]], false, { revision: 2, resumeAt: 1 });
  assert.equal(f.players[0].destroyed, 1);
  assert.deepEqual(f.sources[1].segments, videoSessionSegments([extended[1]]));
  f.video.dispatchEvent(new Event("loadedmetadata"));
  assert.equal(f.players[1].currentTime, 1);
  assert.equal(f.players[1].played, 0);
  assert.equal(f.video.muted, true);
  assert.equal(f.video.volume, 0.3);
  await f.controller.update([extended[1]], true, { revision: 3, resumeAt: 0 });
  f.video.dispatchEvent(new Event("loadedmetadata"));
  assert.equal(f.players[2].currentTime, 0);
  assert.equal(f.players[2].played, 1);
  f.controller.dispose();
});

test("disposal or a newer update cancels a pending browser module load", async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const f = fixture({ loadMpegts: () => pending });
  const first = f.controller.update(clips);
  const second = f.controller.update(extended);
  resolve(f.library);
  await Promise.all([first, second]);
  assert.equal(f.players.length, 1);
  assert.equal(f.sources[0].segments.length, 2);
  f.controller.dispose();

  const g = fixture({ loadMpegts: () => pending });
  const update = g.controller.update(clips);
  g.controller.dispose();
  await update;
  assert.equal(g.players.length, 0);
});

test("unsupported MSE, loader failures, attachment failures and async errors produce fallbacks", async () => {
  const unsupported = fixture({ supported: false });
  await unsupported.controller.update(clips);
  assert.equal(unsupported.states.at(-1), "unsupported");
  assert.equal(unsupported.players.length, 0);
  const rejected = fixture({ loadMpegts: async () => { throw new Error("load failed"); } });
  await rejected.controller.update(clips);
  assert.equal(rejected.states.at(-1), "error");
  for (const failure of ["attach", "load"]) {
    const f = fixture({ failure });
    await f.controller.update(clips);
    assert.equal(f.states.at(-1), "error");
    assert.equal(f.players[0].destroyed, 1);
  }
  for (const native of [false, true]) {
    const f = fixture();
    await f.controller.update(clips);
    if (native) f.video.dispatchEvent(new Event("error"));
    else f.players[0].emit("player-error");
    assert.equal(f.states.at(-1), "error");
    assert.equal(f.players[0].destroyed, 1);
    f.controller.dispose();
    assert.equal(f.players[0].destroyed, 1);
  }
});

test("clearing clips removes old listeners and cancels stale metadata/error callbacks", async () => {
  const f = fixture();
  await f.controller.update(clips, true);
  await f.controller.update([]);
  f.video.dispatchEvent(new Event("loadedmetadata"));
  f.video.dispatchEvent(new Event("error"));
  f.players[0].emit("player-error");
  assert.equal(f.players[0].played, 0);
  assert.equal(f.states.at(-1), "empty");
});


test("continuous mode keeps one player across metadata refreshes and only rebuilds for explicit seek", async () => {
  const f = fixture();
  f.video.readyState = 4;
  const source = { revision: 2, startIndex: 0, startPtsMs: 0n, firstVideoCid: CID, resumeAt: 0, readClip: async () => null, playIntent: () => false };
  await f.controller.updateContinuous(source);
  f.video.dispatchEvent(new Event("loadedmetadata"));
  f.video.currentTime = 34;
  await f.controller.updateContinuous({ ...source });
  assert.equal(f.players.length, 1);
  assert.equal(f.video.currentTime, 34);
  assert.equal(f.players[0].destroyed, 0);
  assert.equal(f.configs[0].lazyLoad, false);
  assert.equal(typeof f.configs[0].customLoader, "function");
  await f.controller.updateContinuous({ ...source, revision: 4, startIndex: 500 });
  assert.equal(f.players.length, 2);
  assert.equal(f.players[0].destroyed, 1);
  f.controller.dispose();
});
