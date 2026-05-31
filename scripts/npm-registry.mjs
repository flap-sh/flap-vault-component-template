const NPM_REGISTRY_URL = "https://registry.npmjs.org";
const REGISTRY_TIMEOUT_MS = 15_000;

function compactBody(body) {
  return body.length > 240 ? `${body.slice(0, 240)}...` : body;
}

export async function readNpmLatestPackageMetadata(packageName) {
  const packagePath = encodeURIComponent(packageName);
  const response = await fetch(`${NPM_REGISTRY_URL}/${packagePath}/latest`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = compactBody(await response.text().catch(() => ""));
    throw new Error(`npm registry returned ${response.status} for ${packageName}@latest${body ? `: ${body}` : ""}.`);
  }

  const metadata = await response.json();
  return {
    version: typeof metadata?.version === "string" ? metadata.version : undefined,
    gitHead: typeof metadata?.gitHead === "string" ? metadata.gitHead : undefined,
  };
}
