const NPM_REGISTRY_URL = "https://registry.npmjs.org";
const REGISTRY_TIMEOUT_MS = 15_000;

function compactBody(body) {
  return body.length > 240 ? `${body.slice(0, 240)}...` : body;
}

// Preserve HTTP status and the exact selector: only a real 404 from the fixed
// public registry can authorize the narrowly scoped routing bootstrap.
export class NpmRegistryHttpError extends Error {
  constructor(packageName, selector, status, body = "") {
    super(`npm registry returned ${status} for ${packageName}@${selector}${body ? `: ${compactBody(body)}` : ""}.`);
    this.name = "NpmRegistryHttpError";
    this.packageName = packageName;
    this.selector = selector;
    this.status = status;
  }
}

export function isNpmRegistryNotFound(error, packageName, selector) {
  return error instanceof NpmRegistryHttpError && error.status === 404 && error.packageName === packageName && error.selector === selector;
}

async function readRegistryJson(packageName, selector, url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
  });
  if (!response.ok) throw new NpmRegistryHttpError(packageName, selector, response.status, await response.text().catch(() => ""));
  return response.json();
}

function packageMetadata(metadata) {
  return {
    version: typeof metadata?.version === "string" ? metadata.version : undefined,
    gitHead: typeof metadata?.gitHead === "string" ? metadata.gitHead : undefined,
  };
}

export async function readNpmPackageTagMetadata(packageName, tag = "latest") {
  if (!["latest", "next", "routing"].includes(tag)) throw new Error("Only latest, next and routing npm channels are supported.");
  return packageMetadata(await readRegistryJson(packageName, tag, `${NPM_REGISTRY_URL}/${encodeURIComponent(packageName)}/${tag}`));
}

export async function readNpmPackageVersionMetadata(packageName, version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(version || "")) throw new Error("Use an exact npm package version.");
  return packageMetadata(await readRegistryJson(packageName, version, `${NPM_REGISTRY_URL}/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`));
}

export async function readNpmPackageDistTags(packageName) {
  const tags = await readRegistryJson(packageName, "dist-tags", `${NPM_REGISTRY_URL}/-/package/${encodeURIComponent(packageName)}/dist-tags`);
  if (!tags || typeof tags !== "object" || Array.isArray(tags) || Object.values(tags).some((value) => typeof value !== "string")) throw new Error("npm registry returned invalid dist-tags metadata.");
  return tags;
}

export function readNpmLatestPackageMetadata(packageName) {
  return readNpmPackageTagMetadata(packageName, "latest");
}
