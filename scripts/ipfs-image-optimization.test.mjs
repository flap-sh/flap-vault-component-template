import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import nextConfig from "../next.config.mjs";
const { imageConfigDefault } = createRequire(import.meta.url)("next/dist/shared/lib/image-config");

const { build } = createRequire(import.meta.resolve("tsup"))("esbuild");
const tmp = await mkdtemp(path.join(os.tmpdir(), "ipfs-image-optimization-"));
const cid = "Qm" + "a".repeat(44);
let server, browser;
try {
  await build({
    absWorkingDir: process.cwd(),
    stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import * as React from 'react';
      import { createRoot } from 'react-dom/client';
      import { IpfsImage } from './src/ui/IpfsImage';
      import { IpfsImageOptimizationContext } from './src/sdk/imageOptimization';
      import { optimizeIpfsImage } from './src/shell/ipfsImageOptimization';
      const root = createRoot(document.getElementById('root'));
      globalThis.optimize = optimizeIpfsImage;
      globalThis.renderImage = (props = {}, enabled = true) => root.render(
        <IpfsImageOptimizationContext.Provider value={enabled === "throw" ? () => { throw new Error("adapter unavailable"); } : enabled ? optimizeIpfsImage : undefined}>
          <IpfsImage cid="${cid}" alt="Legacy image" className="legacy-image" {...props} />
        </IpfsImageOptimizationContext.Provider>);
      globalThis.renderImage({ style: { marginTop: "10000px" } });
    ` },
    define: { "process.env.NODE_ENV": JSON.stringify("production"), "process.env.__NEXT_IMAGE_OPTS": JSON.stringify({ ...imageConfigDefault, ...nextConfig.images }) },
    outfile: path.join(tmp, "app.js"), bundle: true, format: "esm", platform: "browser", jsx: "automatic",
  });
  server = createServer(async (req, res) => {
    res.setHeader("Content-Type", req.url === "/app.js" ? "text/javascript" : "text/html");
    res.end(req.url === "/app.js" ? await readFile(path.join(tmp, "app.js")) : '<div id="root"></div><script type="module" src="/app.js"></script>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const page = await browser.newPage();
  // No real gateway traffic. Errors are dispatched explicitly to test each transition.
  await page.route("**/_next/image?**", route => route.abort());
  await page.route("https://*.mypinata.cloud/**", route => route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => globalThis.optimize);
  const result = await page.evaluate(() => {
    const image = optimize({ src: 'https://flap.mypinata.cloud/ipfs/test', width: 160 });
    const legacy = optimize({ src: 'https://flap.mypinata.cloud/ipfs/test' });
    return { image, legacy };
  });
  assert.match(result.image.src, /^\/_next\/image\?/);
  assert.equal(result.image.sizes, "160px");
  assert.equal(result.legacy.sizes, undefined);
  assert.equal(result.legacy.srcSet, undefined);
  assert.ok(result.image.srcSet.includes("640w"));
  // Use native lazy loading offscreen to keep browser network errors from racing the explicit events.
  await page.evaluate(() => renderImage({ path: 'legacy.png', style: { marginTop: '10000px', width: '123px' }, onError: () => { globalThis.finalErrors = (globalThis.finalErrors || 0) + 1; } }));
  await page.waitForFunction(() => document.querySelector('img')?.getAttribute('src')?.includes('legacy.png'));
  const snapshot = () => page.locator('img').evaluate(el => ({ src: el.getAttribute('src'), srcSet: el.getAttribute('srcset'), width: el.style.width, alt: el.alt }));
  assert.equal((await snapshot()).width, '123px');
  assert.equal((await snapshot()).alt, 'Legacy image');
  const fail = async () => {
    await page.locator('img').dispatchEvent('error');
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };
  await fail();
  assert.equal((await snapshot()).src, `https://flap.mypinata.cloud/ipfs/${cid}/legacy.png`);
  assert.equal((await snapshot()).srcSet, null);
  await fail();
  assert.match((await snapshot()).src, /^\/_next\/image\?/);
  await fail();
  assert.equal((await snapshot()).src, `https://magenta-naval-penguin-822.mypinata.cloud/ipfs/${cid}/legacy.png`);
  await fail();
  assert.equal(await page.evaluate(() => globalThis.finalErrors), 1);
  await page.evaluate(() => renderImage({ path: 'changed.png', style: { marginTop: '10000px' } }));
  await page.waitForFunction(() => document.querySelector('img')?.getAttribute('src')?.startsWith('/_next/image'));
  await page.evaluate(() => renderImage({ cid: 'invalid' }));
  await page.waitForFunction(() => !document.querySelector('img'));
  await page.evaluate(() => renderImage({ path: '../escape' }));
  await page.waitForFunction(() => !document.querySelector('img'));
  await page.evaluate(() => renderImage({ path: 'direct.png', style: { marginTop: '10000px' } }, false));
  await page.waitForFunction(() => document.querySelector('img')?.getAttribute('src')?.startsWith('https://flap.mypinata.cloud'));
  await page.evaluate(() => renderImage({ path: 'adapter-error.png', style: { marginTop: '10000px' } }, 'throw'));
  await page.waitForFunction(() => document.querySelector('img')?.getAttribute('src')?.endsWith('/adapter-error.png'));
  assert.equal((await snapshot()).srcSet, null);
  console.log('PASS: legacy layout, Next URLs/sizes, optimized/direct/gateway fallback, resource reset, CID/path rejection, no-adapter compatibility');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(tmp, { recursive: true, force: true });
}
