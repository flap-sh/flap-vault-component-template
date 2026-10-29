import { ROUTING_VERSION_PATTERN, assertRuntimeReleaseChannel } from "./runtime-package-mode.mjs";
import { isNpmRegistryNotFound, readNpmPackageDistTags, readNpmPackageTagMetadata, readNpmPackageVersionMetadata } from "./npm-registry.mjs";

const PACKAGE_NAME = "@flapsdk/vault-runtime";
const GIT_HEAD = /^[a-f0-9]{40}$/i;
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function assertMetadata(metadata, pattern, tag) {
  if (!pattern.test(metadata?.version || "") || !GIT_HEAD.test(metadata?.gitHead || "")) throw new Error(`npm ${tag} requires a valid channel version and published gitHead.`);
}

function assertContains(metadata, tag, containsGitHead) {
  if (!containsGitHead(metadata.gitHead)) throw new Error(`Routing source must contain npm ${tag} ${metadata.version} published gitHead ${metadata.gitHead}.`);
}

/** Called only after the clean, exact official routing source gate. No skip path. */
export async function assertRoutingRegistryFresh({
  packageName = PACKAGE_NAME,
  localVersion,
  containsGitHead,
  readTagMetadata = readNpmPackageTagMetadata,
  readDistTags = readNpmPackageDistTags,
  readVersionMetadata = readNpmPackageVersionMetadata,
}) {
  if (packageName !== PACKAGE_NAME || typeof containsGitHead !== "function") throw new Error("Routing requires the official runtime package and verified git ancestry.");
  assertRuntimeReleaseChannel(localVersion, "routing");
  let published;
  try { published = await readTagMetadata(packageName, "routing"); }
  catch (error) {
    if (!isNpmRegistryNotFound(error, packageName, "routing")) throw error;
    const tags = await readDistTags(packageName);
    if (!tags || typeof tags !== "object" || Array.isArray(tags) || Object.hasOwn(tags, "routing") || !STABLE_VERSION.test(tags.latest || "")) throw new Error("Routing bootstrap requires verified dist-tags with latest and no routing tag.");
    try {
      await readVersionMetadata(packageName, localVersion);
    } catch (versionError) {
      if (!isNpmRegistryNotFound(versionError, packageName, localVersion)) throw versionError;
      const latest = await readTagMetadata(packageName, "latest");
      assertMetadata(latest, STABLE_VERSION, "latest");
      if (latest.version !== tags.latest) throw new Error("npm latest changed during routing bootstrap; retry the complete release gate.");
      assertContains(latest, "latest", containsGitHead);
      return { ok: true, npmPackageName: packageName, npmTag: "routing", localVersion, latestVersion: undefined, latestGitHead: latest.gitHead, bootstrapFromLatestVersion: latest.version, status: "routing-bootstrap" };
    }
    throw new Error(`Routing version ${localVersion} already exists; bootstrap cannot reuse a published version.`);
  }
  assertMetadata(published, ROUTING_VERSION_PATTERN, "routing");
  const local = ROUTING_VERSION_PATTERN.exec(localVersion).slice(1).map(Number);
  const remote = ROUTING_VERSION_PATTERN.exec(published.version).slice(1).map(Number);
  const changed = local.findIndex((value, index) => value !== remote[index]);
  if (changed !== -1 && local[changed] < remote[changed]) throw new Error(`Routing version ${localVersion} is older than npm routing ${published.version}.`);
  assertContains(published, "routing", containsGitHead);
  return { ok: true, npmPackageName: packageName, npmTag: "routing", localVersion, latestVersion: published.version, latestGitHead: published.gitHead, status: changed === -1 ? "up-to-date" : "ahead-of-npm" };
}
