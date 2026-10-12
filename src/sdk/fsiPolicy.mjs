/** Platform-owned query exception. Never derive this allowlist from a manifest. */
export const FSI_QUERY_PREFIX = "https://bsc-debug.butterfly.army/fsi/v1";
const FSI_ORIGIN = "https://bsc-debug.butterfly.army";
const FSI_PATH = "/fsi/v1";

export function isFsiQueryUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === FSI_ORIGIN && !url.username && !url.password && !url.hash &&
      (url.pathname === FSI_PATH || url.pathname.startsWith(`${FSI_PATH}/`)) &&
      !/%(?:2e|2f|5c|25)/i.test(url.pathname);
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
  if (typeof path !== "string" || path.startsWith("/") || /[\\?#\s]/.test(path)) {
    throw new Error("FSI path must be relative to /fsi/v1 without query or fragment; pass query parameters separately.");
  }
  if (path.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("FSI path traversal is not allowed.");
  }
  const url = new URL(`${FSI_QUERY_PREFIX}/${path}`);
  if (!isFsiQueryUrl(url.href)) throw new Error("FSI URL is outside the platform query allowlist.");
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== "string") throw new Error("FSI query parameter values must be strings.");
    url.searchParams.set(key, value);
  }
  return url.href;
}
