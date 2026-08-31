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
