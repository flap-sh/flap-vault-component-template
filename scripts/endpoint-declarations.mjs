export function normalizeManifestEndpoints(endpoints) {
  if (endpoints === undefined) return [];
  if (typeof endpoints === "string") return [endpoints];
  if (Array.isArray(endpoints)) return endpoints;
  return null;
}

export function collectDeclaredFetchUrls(manifest) {
  return new Set((normalizeManifestEndpoints(manifest.endpoints) ?? [])
    .filter((endpoint) => typeof endpoint === "string"));
}

export function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function hrefWithoutHash(url) {
  const next = new URL(url.href);
  next.hash = "";
  return next.href;
}

function isSamePathOrChild(candidatePath, declaredPath) {
  if (candidatePath === declaredPath) return true;
  const basePath = declaredPath.endsWith("/") ? declaredPath : `${declaredPath}/`;
  return candidatePath.startsWith(basePath);
}

export function isDeclaredUrl(url, declaredUrls) {
  const candidate = parseUrl(url);
  if (!candidate) return false;
  if (candidate.username || candidate.password) return false;

  for (const declared of declaredUrls) {
    const allowed = parseUrl(declared);
    if (!allowed) continue;
    if (allowed.username || allowed.password) continue;
    if (candidate.origin !== allowed.origin) continue;
    if (allowed.search) {
      if (hrefWithoutHash(candidate) === hrefWithoutHash(allowed)) return true;
      continue;
    }
    if (isSamePathOrChild(candidate.pathname, allowed.pathname)) return true;
  }
  return false;
}
