import assert from "node:assert/strict";
import test from "node:test";
import { fetchCardImage } from "./fetchCardImage.ts";
import { normalizeCardImageUrl } from "./cardImageUrl.mjs";

const host = "8nothtoc5ds7a0x3.public.blob.vercel-storage.com";
const prefix = "https://" + host + "/graded-cards-renders/";
const valid = prefix + "sample/card.jpg";
const rejected = [
  null, {}, "", " " + valid, valid + "\n",
  valid.replace("https:", "http:"),
  valid.replace(host, "images." + host),
  valid.replace(host, host + ".example"),
  valid.replace(host, "someone@" + host),
  valid.replace(host, host + ":8080"),
  valid.replace(host, "other.public.blob.vercel-storage.com"),
  valid.replace("/graded-cards-renders/", "/outside/"),
  valid.replace("/graded-cards-renders/", "/graded-cards-renders-other/"),
  prefix, prefix + "../elsewhere.jpg", prefix + "set/../hidden.jpg",
  prefix + "%2e%2e/hidden.jpg", prefix + "%252fhidden.jpg",
  prefix + "a%2fb.jpg", prefix + "a%5cb.jpg",
  prefix + "set/" + String.fromCharCode(92) + "hidden.jpg",
  valid + "?url=https://example.com", valid + "#part",
];

test("accepts only the exact approved image origin and safe paths under the approved directory", () => {
  assert.equal(normalizeCardImageUrl(valid), valid);
  assert.equal(normalizeCardImageUrl(prefix + "another/image%20one.webp"), prefix + "another/image%20one.webp");
  for (const input of rejected) assert.equal(normalizeCardImageUrl(input), null, String(input));
});

test("fetches a bounded raster with anonymous CORS and no redirect or referrer", async () => {
  const { signal } = new AbortController();
  const jpeg = new Uint8Array([255, 216, 255, 217]);
  const blob = await fetchCardImage(valid, signal, async (url, options) => {
    assert.equal(url, valid);
    assert.deepEqual(options, {
      method: "GET", mode: "cors", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", signal,
    });
    return new Response(jpeg, { headers: { "Content-Type": "image/jpeg" } });
  });
  assert.equal(blob.type, "image/jpeg");
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), jpeg);
});

test("rejects unapproved URLs before initiating a network request", async () => {
  const { signal } = new AbortController();
  let requested = false;
  for (const input of rejected) {
    await assert.rejects(fetchCardImage(input, signal, async () => { requested = true; }), /Invalid card image URL/);
  }
  assert.equal(requested, false);
});

test("rejects non-raster, redirect, oversized and empty responses", async () => {
  const { signal } = new AbortController();
  const badResponses = [
    new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }),
    Response.redirect(valid, 302),
    new Response("oversized", { headers: { "content-type": "image/png", "content-length": "10000000" } }),
    new Response(new Uint8Array(0), { headers: { "content-type": "image/png" } }),
  ];
  for (const response of badResponses) {
    await assert.rejects(fetchCardImage(valid, signal, async () => response), /card image/i);
  }
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8 * 1024 * 1024));
      controller.enqueue(new Uint8Array(1));
    },
  });
  await assert.rejects(
    fetchCardImage(valid, signal, async () => new Response(body, { headers: { "content-type": "image/png" } })),
    /too large/,
  );
});
