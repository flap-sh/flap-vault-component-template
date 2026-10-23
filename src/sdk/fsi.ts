import { FSI_QUERY_PREFIXES, buildFsiQueryUrl, resolveFsiQueryPrefix } from "./fsiPolicy.mjs";
import type { VaultManifest } from "./types";

/** Host/runtime helper; components use sdk.readFsi so the manifest is host-owned. */
export async function readFsiJson<T>(
  endpoints: VaultManifest["endpoints"],
  path: string,
  params?: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const prefix = resolveFsiQueryPrefix(endpoints);
  if (!prefix) {
    throw new Error(`FSI requires ${FSI_QUERY_PREFIXES.join(" or ")} in manifest.endpoints for review.`);
  }
  const url = buildFsiQueryUrl(path, params, prefix);
  const response = await fetchImpl(url, {
    method: "GET",
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`FSI request returned ${response.status}.`);
  return await response.json() as T;
}
