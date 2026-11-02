import assert from "node:assert/strict";
import test from "node:test";
import { assertRoutingRegistryFresh } from "./runtime-routing-release.mjs";
import { NpmRegistryHttpError } from "./npm-registry.mjs";

const pkg = "@flapsdk/vault-runtime";
const version = "0.1.40-beta.routing.0";
const head = "a".repeat(40);
const missing = (selector, status = 404, name = pkg) => new NpmRegistryHttpError(name, selector, status);
function bootstrap(overrides = {}) {
  const calls = [];
  const options = {
    localVersion: version,
    containsGitHead: (value) => { calls.push(["ancestor", value]); return value === head; },
    readTagMetadata: async (_, tag) => { calls.push(["tag", tag]); if (tag === "routing") throw missing(tag); return { version: "0.1.39", gitHead: head }; },
    readDistTags: async () => { calls.push(["dist-tags"]); return { latest: "0.1.39", next: "0.1.40-next.4" }; },
    readVersionMetadata: async (_, value) => { calls.push(["version", value]); throw missing(value); },
    ...overrides,
  };
  return { options, calls, run: () => assertRoutingRegistryFresh(options) };
}

test("first routing release requires tag 404, absent dist-tag, exact version 404 and latest ancestry", async () => {
  const fixture = bootstrap();
  const result = await fixture.run();
  assert.equal(result.status, "routing-bootstrap");
  assert.equal(result.bootstrapFromLatestVersion, "0.1.39");
  assert.equal(result.latestGitHead, head);
  assert.deepEqual(fixture.calls, [["tag", "routing"], ["dist-tags"], ["version", version], ["tag", "latest"], ["ancestor", head]]);
});

test("bootstrap rejects lookalike 404s, auth/server/network errors and wrong selectors", async () => {
  for (const error of [new Error("404 Not found"), { status: 404 }, missing("routing", 401), missing("routing", 503), missing("next"), missing("routing", 404, "other")]) {
    let checked = false;
    await assert.rejects(bootstrap({ readTagMetadata: async () => { throw error; }, readDistTags: async () => { checked = true; } }).run());
    assert.equal(checked, false);
  }
});

test("bootstrap rejects existing tags/versions, partial metadata and every failed verification", async () => {
  for (const readDistTags of [async () => ({ latest: "0.1.39", routing: version }), async () => ({}), async () => null, async () => { throw missing("dist-tags", 503); }]) await assert.rejects(bootstrap({ readDistTags }).run());
  for (const readVersionMetadata of [async () => ({ version }), async () => { throw missing(version, 500); }, async () => { throw missing("routing"); }, async () => { throw new Error("network unavailable"); }]) await assert.rejects(bootstrap({ readVersionMetadata }).run());
  for (const latest of [{ version: "0.1.39" }, { version: "0.1.40-next.4", gitHead: head }, { version: "0.1.40", gitHead: head }, { version: "0.1.39", gitHead: "invalid" }]) {
    await assert.rejects(bootstrap({ readTagMetadata: async (_, tag) => { if (tag === "routing") throw missing(tag); return latest; } }).run());
  }
  await assert.rejects(bootstrap({ containsGitHead: () => false }).run(), /must contain npm latest/);
  await assert.rejects(bootstrap({ packageName: "other" }).run(), /official runtime/);
});

test("existing routing tag validates only its own versions and source ancestry", async () => {
  for (const localVersion of [version, "0.1.40-beta.routing.1", "0.1.41-beta.routing.0"]) {
    const fixture = bootstrap({ localVersion, readTagMetadata: async (_, tag) => { assert.equal(tag, "routing"); return { version, gitHead: head }; }, readDistTags: async () => { assert.fail("must not read dist-tags"); }, readVersionMetadata: async () => { assert.fail("must not bootstrap"); } });
    assert.equal((await fixture.run()).status, localVersion === version ? "up-to-date" : "ahead-of-npm");
  }
  for (const published of [{ version: "0.1.40-beta.routing.1", gitHead: head }, { version: "0.1.40-next.4", gitHead: head }, { version: "0.1.40-routing.0", gitHead: head }, { version }, { version, gitHead: "invalid" }]) await assert.rejects(bootstrap({ readTagMetadata: async () => published }).run());
  await assert.rejects(bootstrap({ containsGitHead: () => false, readTagMetadata: async () => ({ version, gitHead: head }) }).run(), /must contain npm routing/);
});
