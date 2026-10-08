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
// Immutable, public clips from the Flap Video Generator documentation's demo.
const clips = [
  { videoCid: "bafybeiaijek2oadrl3clltdt7dfxdeo3fmrvkx2e4zrb63te3txzkjsuxe", durationMs: 8021 },
  { videoCid: "bafybeic3lk73je7in7lbhpfdrag5d63cn6qnfwgnxrdygzd33og7rgtmzi", durationMs: 8021 },
];
const tmp = await mkdtemp(path.join(os.tmpdir(), "flap-video-session-browser-"));
let browser;
let server;
try {
  await build({
    absWorkingDir: ROOT,
    stdin: {
      contents: `import * as React from "react";
import { createRoot } from "react-dom/client";
import { VideoSessionPlayer } from "./src/ui/VideoSessionPlayer";
const root = createRoot(document.getElementById("root"));
globalThis.renderClips = (clips) => root.render(React.createElement(React.StrictMode, null,
  React.createElement(VideoSessionPlayer, { clips, label: "Video session", fallback: "Video unavailable", muted: true })));
globalThis.unmountPlayer = () => root.unmount();
globalThis.renderClips([]);`,
      resolveDir: ROOT, sourcefile: "app.tsx", loader: "tsx",
    },
    outdir: tmp, entryNames: "app", bundle: true, splitting: true, format: "esm", platform: "browser",
  });
  server = createServer(async (req, res) => {
    if (req.url === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end('<div id="root"></div><script type="module" src="/app.js"></script>');
      return;
    }
    const name = path.basename((req.url || "").split("?")[0]);
    try {
      res.setHeader("Content-Type", "text/javascript");
      res.end(await readFile(path.join(tmp, name)));
    } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 720, height: 720 } });
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
  page.on("request", (request) => requests.push(request.url()));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const state = (expected) => page.waitForFunction((value) => document.querySelector("[data-flap-video-session-state]")?.dataset.flapVideoSessionState === value, expected, { timeout: 45_000 });
  await state("empty");
  assert.equal(requests.some((url) => url.includes("mpegts-") || url.includes("/ipfs/")), false);
  await page.evaluate(() => renderClips([{ videoCid: "https://evil.example/video.ts", durationMs: 8000 }]));
  await state("invalid");
  assert.equal(requests.some((url) => url.includes("/ipfs/") || url.includes("evil.example")), false);

  await page.evaluate((value) => renderClips(value), clips.slice(0, 1));
  await state("ready");
  // Metadata can arrive before the target bytes. This fixture tests append
  // restoration, so establish a buffered seek before capturing its position.
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    if (!video) return false;
    for (let index = 0; index < video.buffered.length; index++) {
      if (video.buffered.start(index) <= 2 && video.buffered.end(index) > 2) return true;
    }
    return false;
  }, undefined, { timeout: 45_000 });
  await page.evaluate(async () => { const video = document.querySelector("video"); await video.play(); video.pause(); video.currentTime = 2; });
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    return video && !video.seeking && Math.abs(video.currentTime - 2) < 0.2;
  });
  const originalSrc = await page.locator("video").getAttribute("src");
  await page.evaluate((value) => renderClips(value), clips.slice(0, 1));
  // Two animation frames let React flush the re-render without a fixed sleep.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  assert.equal(await page.locator("video").getAttribute("src"), originalSrc);

  await page.evaluate((value) => renderClips(value), clips);
  await page.waitForFunction((previous) => {
    const src = document.querySelector("video").getAttribute("src");
    return src?.startsWith("blob:") && src !== previous;
  }, originalSrc);
  await state("ready");
  await page.waitForFunction(() => Math.abs(document.querySelector("video").currentTime - 2) < 0.25);
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    return Number.isFinite(video.duration) && video.duration > 16;
  }, undefined, { timeout: 45_000 });
  const snapshot = await page.locator("video").evaluate((video) => ({
    duration: video.duration, currentTime: video.currentTime, paused: video.paused,
    controls: video.controls, playsInline: video.playsInline, label: video.getAttribute("aria-label"),
  }));
  assert.ok(Math.abs(snapshot.duration - 16.042) < 0.25, JSON.stringify(snapshot));
  assert.equal(snapshot.paused, true);
  assert.equal(snapshot.controls, true);
  assert.equal(snapshot.playsInline, true);
  assert.equal(snapshot.label, "Video session");
  await page.evaluate(async () => { await document.querySelector("video").play(); });
  await page.waitForFunction(() => document.querySelector("video").currentTime > 2.2);
  await page.evaluate(() => unmountPlayer());
  assert.equal(await page.locator("video").count(), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, strictMode: true, realMpegtsClips: clips.length, ...snapshot }));
} catch (error) {
  if (browser) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    for (const page of pages) console.error(await page.evaluate(() => ({ state: document.querySelector("[data-flap-video-session-state]")?.dataset.flapVideoSessionState, video: [...document.querySelectorAll("video")].map((v) => ({ duration: v.duration, time: v.currentTime, readyState: v.readyState, paused: v.paused, error: v.error?.message })) })));
  }
  throw error;
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(tmp, { recursive: true, force: true });
}
