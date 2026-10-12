/** Platform-owned query exception. Never derive this allowlist from a manifest. */
export const FSI_QUERY_PREFIX = "https://bsc-debug.butterfly.army/fsi/v1";
const FSI_ORIGIN = "https://bsc-debug.butterfly.army";
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
    return url.origin === FSI_ORIGIN && !url.username && !url.password && !url.hash &&
      (url.pathname === FSI_PATH || url.pathname.startsWith(`${FSI_PATH}/`)) &&
      !encodedPathSyntax.test(url.pathname);
  } catch {
    return false;
  }
}

export function hasFsiQueryDeclaration(endpoints) {
  const urls = typeof endpoints === "string" ? [endpoints] : endpoints;
  return Array.isArray(urls) && urls.some((value) => {
    if (!isFsiQueryUrl(value)) return false;
    const url = new URL(value);
    return !url.search && (url.pathname === FSI_PATH || url.pathname === `${FSI_PATH}/`);
  });
}

export function buildFsiQueryUrl(path, params = {}) {
  if (typeof path !== "string" || path.startsWith("/") || /[\\?#\s\u0000-\u001f\u007f]/.test(path)) {
    throw new Error("FSI path must be relative to /fsi/v1 without query or fragment; pass query parameters separately.");
  }
  if (encodedPathSyntax.test(path) || hasDotSegment(path)) {
    throw new Error("FSI path traversal and encoded path separators/dots are not allowed.");
  }
  const url = new URL(`${FSI_QUERY_PREFIX}/${path}`);
  if (!isFsiQueryUrl(url.href)) throw new Error("FSI URL is outside the platform query allowlist.");
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== "string") throw new Error("FSI query parameter values must be strings.");
    url.searchParams.set(key, value);
  }
  return url.href;
}
