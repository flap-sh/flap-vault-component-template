import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { chromium } from "@playwright/test";

const { build } = createRequire(import.meta.resolve("tsup"))("esbuild");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4oCAAAAMkASGxehK6AAAAAElFTkSuQmCC", "base64");
const base = "https://8nothtoc5ds7a0x3.public.blob.vercel-storage.com/graded-cards-renders/";
const approved = base + "proof/card.png";
const invalid = approved.replace("graded-cards-renders", "other");

const bundle = await build({
  stdin: {
    contents: `
      import * as React from "react";
      import { createRoot } from "react-dom/client";
      import { Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, Scene, SRGBColorSpace, Texture, WebGLRenderer } from "three";
      import { CardImage, useCardImageBitmap } from "./src/ui/CardImage";
      const root = createRoot(document.getElementById("root"));
      let liveBitmaps = 0;
      const nativeBitmap = globalThis.createImageBitmap.bind(globalThis);
      const nativeCloseBitmap = ImageBitmap.prototype.close;
      globalThis.createImageBitmap = async (...args) => {
        const bitmap = await nativeBitmap(...args);
        liveBitmaps++;
        return bitmap;
      };
      ImageBitmap.prototype.close = function () {
        liveBitmaps--;
        return nativeCloseBitmap.call(this);
      };

      function TextureProof({ src }) {
        const bitmap = useCardImageBitmap(src);
        const output = React.useRef(null);
        React.useEffect(() => {
          if (!bitmap) return;
          const texture = new Texture(bitmap);
          texture.colorSpace = SRGBColorSpace;
          texture.needsUpdate = true;
          const geometry = new PlaneGeometry(2, 2);
          const material = new MeshBasicMaterial({ map: texture });
          const renderer = new WebGLRenderer();
          renderer.setSize(1, 1);
          const scene = new Scene();
          scene.add(new Mesh(geometry, material));
          const camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
          camera.position.z = 1;
          renderer.render(scene, camera);
          const gl = renderer.getContext();
          const color = new Uint8Array(4);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, color);
          output.current.textContent = Array.from(color).join(",");
          return () => {
            renderer.dispose();
            material.dispose();
            geometry.dispose();
            texture.dispose();
          };
        }, [bitmap]);
        return <output ref={output} data-texture-state={bitmap ? "ready" : "fallback"}>{bitmap ? "" : "No texture"}</output>;
      }

      globalThis.renderCard = (src) => root.render(
        <React.StrictMode>
          <CardImage src={src} alt="Proof card" fallback="No image" />
          <TextureProof src={src} />
        </React.StrictMode>,
      );
      globalThis.countBitmaps = () => liveBitmaps;
    `,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  jsx: "automatic",
  platform: "browser",
  format: "esm",
  logLevel: "warning",
});
const server = createServer((req, res) => {
  if (req.url === "/app.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(bundle.outputFiles[0].contents);
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end('<div id="root"></div><script type="module" src="/app.js"></script>');
  }
});
let browser;
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const requests = [];
  await page.route("https://**/proof/card.png", async route => {
    const request = route.request();
    requests.push(request.url());
    assert.equal(request.method(), "GET");
    assert.equal(request.headers().cookie, undefined);
    assert.equal(request.headers().referer, undefined);
    await route.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: png });
  });

  await page.goto("http://127.0.0.1:" + server.address().port);
  await page.evaluate(url => globalThis.renderCard(url), approved);
  await page.waitForFunction(() => {
    const image = document.querySelector("img");
    return image?.complete && image.naturalWidth === 1 && document.querySelector("output")?.textContent === "240,32,16,255";
  }, null, { timeout: 15_000 });
  assert.match(await page.locator("img").getAttribute("src"), /^blob:/);
  assert.equal(await page.evaluate(() => globalThis.countBitmaps()), 1);
  assert(requests.length > 0 && requests.every(url => url === approved));

  const previousRequests = requests.length;
  await page.evaluate(url => globalThis.renderCard(url), invalid);
  await page.waitForFunction(() => document.querySelector("output")?.textContent === "No texture" && globalThis.countBitmaps() === 0);
  assert.equal(await page.locator("img").count(), 0);
  assert.equal(await page.getByText("No image", { exact: true }).count(), 1);
  assert.equal(requests.length, previousRequests);
  assert.deepEqual(errors, []);
  console.log("Card image and WebGL texture rendered. Invalid source fell back without a request.");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
