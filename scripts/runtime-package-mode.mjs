const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const GIT_HEAD_PATTERN = /^[0-9a-f]{40,64}$/i;

export function parseRuntimePackageMode(args) {
  if (args.length === 0) return "release";
  if (args.length === 1 && args[0] === "--canary") return "canary";
  throw new Error(`Unknown runtime package option: ${args.join(" ") || "<empty>"}. Use --canary for a local test package.`);
}

export function createCanaryVersion(baseVersion, gitHead) {
  const versionMatch = SEMVER_PATTERN.exec(baseVersion);
  if (!versionMatch) throw new Error(`Cannot create a canary from invalid base version ${JSON.stringify(baseVersion)}.`);
  if (!GIT_HEAD_PATTERN.test(gitHead)) throw new Error(`Cannot create a canary from invalid git head ${JSON.stringify(gitHead)}.`);

  const versionWithoutBuild = baseVersion.split("+")[0];
  const separator = versionWithoutBuild.includes("-") ? "." : "-";
  return `${versionWithoutBuild}${separator}canary.${gitHead.slice(0, 12).toLowerCase()}`;
}

export function createRuntimePackageIdentity({ baseVersion, gitHead, mode }) {
  if (mode === "release") {
    return {
      mode,
      version: baseVersion,
      private: false,
      publishConfig: { access: "public" },
      canary: undefined,
    };
  }

  if (mode !== "canary") throw new Error(`Unsupported runtime package mode ${JSON.stringify(mode)}.`);

  return {
    mode,
    version: createCanaryVersion(baseVersion, gitHead),
    private: true,
    publishConfig: undefined,
    canary: {
      channel: "local-canary",
      baseVersion,
      sourceGitHead: gitHead,
      publishable: false,
    },
  };
}

export function assertRuntimePackageIdentity({ manifest, runtimeContract, rootVersion, gitHead, mode }) {
  const expected = createRuntimePackageIdentity({ baseVersion: rootVersion, gitHead, mode });

  if (manifest.version !== expected.version) {
    throw new Error(`Expected runtime package version ${expected.version}, received ${manifest.version}.`);
  }
  if (manifest.gitHead !== gitHead) {
    throw new Error(`Expected runtime package gitHead ${gitHead}, received ${manifest.gitHead}.`);
  }
  if (runtimeContract.packageVersion !== manifest.version) {
    throw new Error(
      `runtime-contract.json packageVersion ${runtimeContract.packageVersion} does not match package.json version ${manifest.version}.`,
    );
  }

  if (mode === "canary") {
    if (manifest.private !== true) throw new Error("Canary runtime packages must set private=true so npm publish refuses them.");
    if (manifest.publishConfig !== undefined) throw new Error("Canary runtime packages must not carry release publishConfig.");
    if (JSON.stringify(manifest.flapCanary) !== JSON.stringify(expected.canary)) {
      throw new Error("Canary runtime package provenance does not match the current committed source.");
    }
    return expected;
  }

  if (manifest.private === true) throw new Error("Release runtime packages must not set private=true.");
  if (JSON.stringify(manifest.publishConfig) !== JSON.stringify(expected.publishConfig)) {
    throw new Error("Release runtime package publishConfig must be public.");
  }
  if (manifest.flapCanary !== undefined) throw new Error("Release runtime packages must not carry canary provenance.");
  return expected;
}
