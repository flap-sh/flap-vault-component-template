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
