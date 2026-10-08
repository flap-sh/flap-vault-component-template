#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { build } = createRequire(import.meta.resolve("tsup"))("esbuild");
const cids = ["bafybeiaijek2oadrl3clltdt7dfxdeo3fmrvkx2e4zrb63te3txzkjsuxe", "bafybeic3lk73je7in7lbhpfdrag5d63cn6qnfwgnxrdygzd33og7rgtmzi"];
const tmp = await mkdtemp(path.join(os.tmpdir(), "flap-consumer-video-browser-"));
let browser;
let server;
try {
  await build({ absWorkingDir: ROOT, stdin: {
    contents: `import * as React from "react";
import { createRoot } from "react-dom/client";
import { VideoSessionPlayer } from "./src/ui/VideoSessionPlayer";
import { RuntimeContext } from "./src/sdk/runtimeStore";
const root = createRoot(document.getElementById("root"));
const cids = ${JSON.stringify(cids)};
globalThis.reads = [];
const sdk = {
  context: { chainId: 56 },
  i18n: { locale: "en", t: (key, fallback, params) => fallback.replace(/\\{(\\w+)\\}/g, (_, key) => String(params?.[key] ?? key)) },
  readContract: async (params) => {
    globalThis.reads.push({ address: params.address, method: params.functionName, args: params.args.map(String) });
    if (params.functionName === "getVideoSessionLength") return 1000n;
    const start = Number(params.args[1]);
    return Array.from({ length: Number(params.args[2]) }, (_, offset) => {
      const index = start + offset;
      return { requestId: BigInt(index), videoCid: index >= 499 ? cids[index % 2] : "bafkreigo6g3mkveu5w3l7ud56qr4oq3sa62hawcdmybdhbi5agurqwm5ye",
        lastFrameCid: "", durationMs: 8021, startPtsMs: BigInt(index) * 8021n, createdAt: 1n, referenceType: 4 };
    });
  },
};
globalThis.renderPlayer = (startClip) => root.render(React.createElement(React.StrictMode, null,
  React.createElement(RuntimeContext.Provider, { value: sdk }, React.createElement(VideoSessionPlayer, {
    consumer: "0x8b527D3f104A1945BD68B391fBd6b4a00B7EA3a2", startClip, label: "Consumer movie", fallback: "Video unavailable", muted: true,
  }))));
globalThis.unmountPlayer = () => root.unmount();
globalThis.renderPlayer(-1);`, resolveDir: ROOT, sourcefile: "app.tsx", loader: "tsx",
  }, outdir: tmp, entryNames: "app", bundle: true, splitting: true, format: "esm", platform: "browser" });
  server = createServer(async (req, res) => {
    if (req.url === "/") { res.setHeader("Content-Type", "text/html"); res.end('<style>.hidden{display:none}</style><div id="root"></div><script type="module" src="/app.js"></script>'); return; }
    try { res.setHeader("Content-Type", "text/javascript"); res.end(await readFile(path.join(tmp, path.basename((req.url || "").split("?")[0])))); }
    catch { res.statusCode = 404; res.end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 720, height: 900 } });
  const errors = [];
  const media = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (request.url().includes("/ipfs/")) media.push(request.url()); });
  const readyAt = (start) => page.waitForFunction((start) => {
    const el = document.querySelector("[data-flap-video-session-state]");
    return el?.dataset.flapVideoSessionState === "ready" && Number(el.dataset.flapVideoWindowStart) === start;
  }, start, { timeout: 45_000 });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await readyAt(999);
  assert.equal(await page.getByRole("button", { name: /^Clip \d+$/ }).count(), 20);
  assert.equal(await page.getByRole("button", { name: "Latest clip", exact: true }).isDisabled(), true);
  await page.locator("video").evaluate((video) => { video.volume = 0.3; video.muted = false; });
  await page.getByLabel("Go to clip", { exact: true }).fill("500");
  await page.getByRole("button", { name: "Go", exact: true }).click();
  await readyAt(499);
  await page.waitForFunction(() => document.querySelector("video").buffered.length && document.querySelector("video").buffered.end(0) > 18, undefined, { timeout: 45_000 });
  let snapshot = await page.locator("video").evaluate((video) => ({ paused: video.paused, muted: video.muted, volume: video.volume, controls: video.controls }));
  assert.deepEqual(snapshot, { paused: true, muted: false, volume: 0.3, controls: true });
  // Native seek near the window tail rolls it and preserves local position.
  await page.locator("video").evaluate((video) => { video.currentTime = 17; });
  await readyAt(501);
  await page.waitForFunction(() => Math.abs(document.querySelector("video").currentTime - 0.958) < 0.25);
  assert.equal(await page.locator("video").evaluate((video) => video.paused), true);
  // Clip scrubber addresses the current clip, not a global 1000-clip MP4 timeline.
  await page.getByRole("slider").fill("2");
  await page.waitForFunction(() => Math.abs(document.querySelector("video").currentTime - 2) < 0.25);
  await page.getByRole("button", { name: "Latest clip", exact: true }).click();
  await readyAt(999);
  await page.getByRole("button", { name: "Previous clip", exact: true }).click();
  await readyAt(998);
  await page.locator("video").evaluate(async (video) => { await video.requestFullscreen(); video.focus(); });
  await page.locator("video").press("n");
  await readyAt(999);
  assert.equal(await page.locator("video").evaluate((video) => document.fullscreenElement === video && getComputedStyle(video).display !== "none"), true);
  await page.evaluate(() => document.exitFullscreen());
  await page.evaluate(() => renderPlayer(501));
  await readyAt(501);
  await page.locator("video").evaluate(async (video) => { await video.play(); });
  await page.waitForFunction(() => document.querySelector("video").currentTime > 0.2);
  const reads = await page.evaluate(() => globalThis.reads);
  const slices = reads.filter((read) => read.method === "getVideoSessionSlice");
  assert.ok(slices.some((read) => read.args[1] === "999" && read.args[2] === "1"));
  assert.ok(slices.some((read) => read.args[1] === "499" && read.args[2] === "4"));
  assert.ok(slices.every((read) => Number(read.args[1]) >= 499 && Number(read.args[2]) <= 4));
  assert.ok(reads.every((read) => read.address === "0xaEe3a7Ca6fe6b53f6c32a3e8407eC5A9dF8B7E39"));
  assert.ok(media.length > 0 && media.every((url) => cids.some((cid) => url.endsWith(cid))));
  await page.evaluate(() => unmountPlayer());
  assert.equal(await page.locator("video").count(), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, strictMode: true, totalClips: 1000, maxWindow: 4, skippedEarlierClips: 499, nativeAudioSettingsPreserved: true, fullscreenSeekPreserved: true, windowRollPreservedPauseAndPosition: true, slices, mediaRequests: media.length }));
} catch (error) {
  if (browser) for (const page of browser.contexts().flatMap((context) => context.pages())) console.error(await page.evaluate(() => ({ state: document.querySelector("[data-flap-video-session-state]")?.dataset, reads: globalThis.reads, video: [...document.querySelectorAll("video")].map((v) => ({ duration: v.duration, time: v.currentTime, readyState: v.readyState, paused: v.paused, error: v.error?.message })) })));
  throw error;
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(tmp, { recursive: true, force: true });
}
