import assert from "node:assert/strict";
import test from "node:test";
import {
  assertRuntimePackageIdentity,
  createCanaryVersion,
  createRuntimePackageIdentity,
  parseRuntimePackageMode,
} from "./runtime-package-mode.mjs";

const GIT_HEAD = "b060115c3e5f7568564fe106505eb83da6470179";

test("parses release and explicit canary package modes", () => {
  assert.equal(parseRuntimePackageMode([]), "release");
  assert.equal(parseRuntimePackageMode(["--canary"]), "canary");
  assert.throws(() => parseRuntimePackageMode(["--local"]), /Unknown runtime package option/);
});

test("creates a commit-bound canary version", () => {
  assert.equal(createCanaryVersion("0.1.29", GIT_HEAD), "0.1.29-canary.b060115c3e5f");
  assert.equal(createCanaryVersion("0.1.29-beta.1", GIT_HEAD), "0.1.29-beta.1.canary.b060115c3e5f");
});

test("marks canary packages private and records provenance", () => {
  const identity = createRuntimePackageIdentity({ baseVersion: "0.1.29", gitHead: GIT_HEAD, mode: "canary" });

  assert.equal(identity.private, true);
  assert.equal(identity.publishConfig, undefined);
  assert.deepEqual(identity.canary, {
    channel: "local-canary",
    baseVersion: "0.1.29",
    sourceGitHead: GIT_HEAD,
    publishable: false,
  });
});

test("next prereleases default to the next npm tag while stable releases keep their config", () => {
  const preview = createRuntimePackageIdentity({ baseVersion: "0.1.32-next.0", gitHead: GIT_HEAD, mode: "release" });
  assert.equal(preview.version, "0.1.32-next.0");
  assert.equal(preview.private, false);
  assert.deepEqual(preview.publishConfig, { access: "public", tag: "next" });
  const stable = createRuntimePackageIdentity({ baseVersion: "0.1.31", gitHead: GIT_HEAD, mode: "release" });
  assert.deepEqual(stable.publishConfig, { access: "public" });
});

test("next release verification rejects a package that could accidentally update latest", () => {
  const baseVersion = "0.1.32-next.0";
  const manifest = { version: baseVersion, gitHead: GIT_HEAD, publishConfig: { access: "public", tag: "next" } };
  const input = { manifest, runtimeContract: { packageVersion: baseVersion }, rootVersion: baseVersion, gitHead: GIT_HEAD, mode: "release" };
  assert.doesNotThrow(() => assertRuntimePackageIdentity(input));
  assert.throws(() => assertRuntimePackageIdentity({ ...input, manifest: { ...manifest, publishConfig: { access: "public" } } }), /publishConfig/);
  assert.throws(() => assertRuntimePackageIdentity({ ...input, manifest: { ...manifest, publishConfig: { access: "public", tag: "latest" } } }), /publishConfig/);
});

test("canaries based on next remain private and cannot be published", () => {
  const identity = createRuntimePackageIdentity({ baseVersion: "0.1.32-next.0", gitHead: GIT_HEAD, mode: "canary" });
  assert.equal(identity.version, "0.1.32-next.0.canary.b060115c3e5f");
  assert.equal(identity.private, true);
  assert.equal(identity.publishConfig, undefined);
  assert.equal(identity.canary.publishable, false);
});

test("rejects canary manifests that could be published or have stale provenance", () => {
  const identity = createRuntimePackageIdentity({ baseVersion: "0.1.29", gitHead: GIT_HEAD, mode: "canary" });
  const runtimeContract = { packageVersion: identity.version };
  const manifest = {
    version: identity.version,
    gitHead: GIT_HEAD,
    private: true,
    flapCanary: identity.canary,
  };

  assert.doesNotThrow(() =>
    assertRuntimePackageIdentity({ manifest, runtimeContract, rootVersion: "0.1.29", gitHead: GIT_HEAD, mode: "canary" }),
  );
  assert.throws(
    () =>
      assertRuntimePackageIdentity({
        manifest: { ...manifest, private: false },
        runtimeContract,
        rootVersion: "0.1.29",
        gitHead: GIT_HEAD,
        mode: "canary",
      }),
    /private=true/,
  );
  assert.throws(
    () =>
      assertRuntimePackageIdentity({
        manifest: { ...manifest, flapCanary: { ...identity.canary, sourceGitHead: "0".repeat(40) } },
        runtimeContract,
        rootVersion: "0.1.29",
        gitHead: GIT_HEAD,
        mode: "canary",
      }),
    /provenance/,
  );
});
