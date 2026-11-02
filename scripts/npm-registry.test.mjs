import assert from "node:assert/strict";
import { test } from "node:test";
import { readNpmPackageTagMetadata, readNpmLatestPackageMetadata } from "./npm-registry.mjs";

test("registry metadata resolves explicit next and preserves the default latest lookup", async (t) => {
  const urls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    urls.push(url);
    return { ok: true, json: async () => ({ version: url.endsWith("/next") ? "0.1.33-next.0" : "0.1.32", gitHead: "a".repeat(40) }) };
  });
  assert.equal((await readNpmPackageTagMetadata("@flapsdk/vault-runtime", "next")).version, "0.1.33-next.0");
  assert.equal((await readNpmLatestPackageMetadata("@flapsdk/vault-runtime")).version, "0.1.32");
  assert.deepEqual(urls, ["https://registry.npmjs.org/%40flapsdk%2Fvault-runtime/next", "https://registry.npmjs.org/%40flapsdk%2Fvault-runtime/latest"]);
  await assert.rejects(readNpmPackageTagMetadata("@flapsdk/vault-runtime", "../latest"));
});

test("routing registry reads use fixed public endpoints and preserve genuine HTTP 404", async (t) => {
  const { readNpmPackageDistTags, readNpmPackageVersionMetadata, isNpmRegistryNotFound } = await import("./npm-registry.mjs");
  const urls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    urls.push(url);
    if (url.includes("/dist-tags")) return new Response(JSON.stringify({ latest: "0.1.39", next: "0.1.40-next.4" }));
    return new Response('{"error":"Not found"}', { status: 404 });
  });
  await assert.rejects(readNpmPackageTagMetadata("@flapsdk/vault-runtime", "routing"), (error) => isNpmRegistryNotFound(error, "@flapsdk/vault-runtime", "routing"));
  assert.equal((await readNpmPackageDistTags("@flapsdk/vault-runtime")).latest, "0.1.39");
  await assert.rejects(readNpmPackageVersionMetadata("@flapsdk/vault-runtime", "0.1.40-beta.routing.0"), (error) => isNpmRegistryNotFound(error, "@flapsdk/vault-runtime", "0.1.40-beta.routing.0"));
  assert.deepEqual(urls, ["https://registry.npmjs.org/%40flapsdk%2Fvault-runtime/routing", "https://registry.npmjs.org/-/package/%40flapsdk%2Fvault-runtime/dist-tags", "https://registry.npmjs.org/%40flapsdk%2Fvault-runtime/0.1.40-beta.routing.0"]);
  await assert.rejects(readNpmPackageVersionMetadata("@flapsdk/vault-runtime", "../latest"));
});

test("network failures, other HTTP statuses and malformed dist-tags do not become missing packages", async (t) => {
  const { readNpmPackageDistTags, isNpmRegistryNotFound } = await import("./npm-registry.mjs");
  for (const status of [401, 403, 429, 500, 503]) {
    t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status }));
    await assert.rejects(readNpmPackageTagMetadata("@flapsdk/vault-runtime", "routing"), (error) => error.status === status && !isNpmRegistryNotFound(error, "@flapsdk/vault-runtime", "routing"));
  }
  t.mock.method(globalThis, "fetch", async () => { throw new Error("network timeout"); });
  await assert.rejects(readNpmPackageTagMetadata("@flapsdk/vault-runtime", "routing"), /network timeout/);
  for (const value of [null, [], { latest: 42 }]) {
    t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(value)));
    await assert.rejects(readNpmPackageDistTags("@flapsdk/vault-runtime"), /invalid dist-tags/);
  }
});

test("registry requests reject redirects instead of treating redirected 404s as bootstrap evidence", async (t) => {
  const { isNpmRegistryNotFound } = await import("./npm-registry.mjs");
  t.mock.method(globalThis, "fetch", async (_, options) => {
    assert.equal(options.redirect, "error");
    throw new TypeError("fetch failed: unexpected redirect");
  });
  await assert.rejects(readNpmPackageTagMetadata("@flapsdk/vault-runtime", "routing"), (error) => /unexpected redirect/.test(error.message) && !isNpmRegistryNotFound(error, "@flapsdk/vault-runtime", "routing"));
});
