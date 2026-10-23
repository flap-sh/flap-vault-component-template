/** Platform-owned query exception. Never derive this allowlist from a manifest. */
export const FSI_QUERY_PREFIX = "https://bsc-debug.butterfly.army/fsi/v1";
// Prefer the current endpoint when both are declared; keep the legacy default
// for callers of buildFsiQueryUrl that do not select a manifest endpoint.
export const FSI_QUERY_PREFIXES = Object.freeze([
  "https://fsi.taxed.fun/fsi/v1",
  FSI_QUERY_PREFIX,
]);
const FSI_ORIGINS = new Set(FSI_QUERY_PREFIXES.map((prefix) => new URL(prefix).origin));
const FSI_PATH = "/fsi/v1";
const encodedPathSyntax = /%(?:2e|2f|5c|25)/i;
const hasDotSegment = (path) => path.split("/").some((part) => part === "." || part === "..");

export function isFsiQueryUrl(value) {
  try {
    // URL parsing removes dot segments (including encoded dots), so inspect the
    // original pathname before normalization can erase the rejected syntax.
    if (typeof value !== "string" || /[\\#\u0000-\u0020\u007f]/.test(value)) return false;
    const rawPath = value.match(/^[a-z][a-z\d+.-]*:\/\/[^/?#]*([^?#]*)/i)?.[1];
    if (rawPath === undefined || encodedPathSyntax.test(rawPath) || hasDotSegment(rawPath)) return false;
    const url = new URL(value);
    return FSI_ORIGINS.has(url.origin) && !url.username && !url.password && !url.hash &&
      (url.pathname === FSI_PATH || url.pathname.startsWith(`${FSI_PATH}/`)) &&
      !encodedPathSyntax.test(url.pathname);
  } catch {
    return false;
  }
}

export function resolveFsiQueryPrefix(endpoints) {
  const urls = typeof endpoints === "string" ? [endpoints] : endpoints;
  if (!Array.isArray(urls)) return null;
  const declared = new Set();
  for (const value of urls) {
    if (!isFsiQueryUrl(value)) continue;
    const url = new URL(value);
    if (!url.search && (url.pathname === FSI_PATH || url.pathname === `${FSI_PATH}/`)) {
      declared.add(`${url.origin}${FSI_PATH}`);
    }
  }
  return FSI_QUERY_PREFIXES.find((prefix) => declared.has(prefix)) ?? null;
}

export function hasFsiQueryDeclaration(endpoints) {
  return resolveFsiQueryPrefix(endpoints) !== null;
}

export function buildFsiQueryUrl(path, params = {}, prefix = FSI_QUERY_PREFIX) {
  if (!FSI_QUERY_PREFIXES.includes(prefix)) {
    throw new Error("FSI URL is outside the platform query allowlist.");
  }
  if (typeof path !== "string" || path.startsWith("/") || /[\\?#\s\u0000-\u001f\u007f]/.test(path)) {
    throw new Error("FSI path must be relative to /fsi/v1 without query or fragment; pass query parameters separately.");
  }
  if (encodedPathSyntax.test(path) || hasDotSegment(path)) {
    throw new Error("FSI path traversal and encoded path separators/dots are not allowed.");
  }
  const url = new URL(`${prefix}/${path}`);
  if (!isFsiQueryUrl(url.href)) throw new Error("FSI URL is outside the platform query allowlist.");
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== "string") throw new Error("FSI query parameter values must be strings.");
    url.searchParams.set(key, value);
  }
  return url.href;
}
