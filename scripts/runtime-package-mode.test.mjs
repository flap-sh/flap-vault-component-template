import assert from "node:assert/strict";
import test from "node:test";
import {
  assertRuntimePackageIdentity,
  assertRuntimeReleaseChannel,
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

test("release packages explicitly select next or latest according to their version", () => {
  const preview = createRuntimePackageIdentity({ baseVersion: "0.1.32-next.0", gitHead: GIT_HEAD, mode: "release" });
  assert.equal(preview.version, "0.1.32-next.0");
  assert.equal(preview.private, false);
  assert.deepEqual(preview.publishConfig, { access: "public", tag: "next" });
  const stable = createRuntimePackageIdentity({ baseVersion: "0.1.38", gitHead: GIT_HEAD, mode: "release" });
  assert.deepEqual(stable.publishConfig, { access: "public", tag: "latest" });
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

test("stable 0.1.38 release rejects preview channels and unsafe prerelease identities", () => {
  assert.doesNotThrow(() => assertRuntimeReleaseChannel("0.1.38", "latest"));
  assert.doesNotThrow(() => assertRuntimeReleaseChannel("0.1.40-next.0", "next"));
  for (const [version, channel] of [["0.1.38", "next"], ["0.1.40-next.0", "latest"], ["0.1.38", "beta"], ["0.1.38-canary.abc", "latest"]]) {
    assert.throws(() => assertRuntimeReleaseChannel(version, channel), /must match/);
  }
  for (const baseVersion of ["invalid", "0.1.38-beta.0", "0.1.38-next.0.canary.abc"]) {
    assert.throws(() => createRuntimePackageIdentity({ baseVersion, gitHead: GIT_HEAD, mode: "release" }), /must match/);
  }
  const version = "0.1.38";
  const input = { manifest: { version, gitHead: GIT_HEAD, publishConfig: { access: "public", tag: "latest" } }, runtimeContract: { packageVersion: version }, rootVersion: version, gitHead: GIT_HEAD, mode: "release" };
  assert.doesNotThrow(() => assertRuntimePackageIdentity(input));
  for (const publishConfig of [{ access: "public" }, { access: "public", tag: "next" }]) {
    assert.throws(() => assertRuntimePackageIdentity({ ...input, manifest: { ...input.manifest, publishConfig } }), /publishConfig/);
  }
});

test("routing releases use only beta.routing versions and the independent routing tag", () => {
  const version = "0.1.40-beta.routing.0";
  const identity = createRuntimePackageIdentity({ baseVersion: version, gitHead: GIT_HEAD, mode: "release" });
  assert.deepEqual(identity.publishConfig, { access: "public", tag: "routing" });
  const input = { manifest: { version, gitHead: GIT_HEAD, publishConfig: identity.publishConfig }, runtimeContract: { packageVersion: version }, rootVersion: version, gitHead: GIT_HEAD, mode: "release" };
  assert.doesNotThrow(() => assertRuntimePackageIdentity(input));
  for (const tag of ["latest", "next", undefined]) assert.throws(() => assertRuntimePackageIdentity({ ...input, manifest: { ...input.manifest, publishConfig: { access: "public", tag } } }), /publishConfig/);
  for (const channel of ["latest", "next", "beta"]) assert.throws(() => assertRuntimeReleaseChannel(version, channel), /must match/);
  for (const version of ["0.1.40", "0.1.40-next.4", "0.1.40-routing.0", "0.1.40-beta.0", "0.1.40-beta.routing.01", "0.1.40-beta.routing.0.canary.abc", "0.1.40-beta.routing.0+build"]) assert.throws(() => assertRuntimeReleaseChannel(version, "routing"), /must match/);
  const canary = createRuntimePackageIdentity({ baseVersion: version, gitHead: GIT_HEAD, mode: "canary" });
  assert.equal(canary.private, true);
  assert.equal(canary.publishConfig, undefined);
  assert.equal(canary.canary.publishable, false);
});
