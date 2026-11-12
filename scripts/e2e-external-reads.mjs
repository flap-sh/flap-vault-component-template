import { isFsiQueryUrl } from "../src/sdk/fsiPolicy.mjs";
import { isDeclaredUrl } from "./endpoint-declarations.mjs";

// Keep this in sync with resolveIpfsImageUrls in src/sdk/ipfsImage.ts.
const IPFS_GATEWAYS = new Set([
  "https://flap.mypinata.cloud",
  "https://magenta-naval-penguin-822.mypinata.cloud",
]);
const IPFS_CID = /^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/;
const IPFS_PATH_SEGMENT = /^[A-Za-z0-9._~-]+$/;

function isIpfsReadUrl(rawUrl, url) {
  // SDK URLs are canonical and have no query, fragment, credentials or escapes.
  if (!IPFS_GATEWAYS.has(url.origin) || rawUrl !== `${url.origin}${url.pathname}` ||
      !url.pathname.startsWith("/ipfs/")) return false;
  const [cid, ...segments] = url.pathname.slice("/ipfs/".length).split("/");
  return cid.length <= 128 && IPFS_CID.test(cid) &&
    segments.join("/").length <= 512 &&
    segments.every((part) => part !== "." && part !== ".." && IPFS_PATH_SEGMENT.test(part));
}

export function isAllowedExternalRead(request, url, declaredFetchUrls) {
  if (request.method() !== "GET" || request.redirectedFrom()) return false;
  const type = request.resourceType();
  const rawUrl = request.url();
  if (type === "fetch" && isFsiQueryUrl(rawUrl) && isDeclaredUrl(rawUrl, declaredFetchUrls)) return true;
  // Source checks enforce use of the controlled IPFS APIs. The browser reports
  // image loads and SDK text reads as image and fetch requests respectively.
  return (type === "image" || type === "fetch") && isIpfsReadUrl(rawUrl, url);
}
