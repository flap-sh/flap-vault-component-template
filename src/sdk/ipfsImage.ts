import { getTaxVaultHostChainConfig } from "./hostRuntimeConfig";

const DEFAULT_IPFS_IMAGE_GATEWAY = "https://flap.mypinata.cloud";
const IPFS_IMAGE_GATEWAYS = ["https://flap.mypinata.cloud", "https://magenta-naval-penguin-822.mypinata.cloud"] as const;
const CID_RE = /^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/;
const PATH_SEGMENT_RE = /^[A-Za-z0-9._~-]+$/;

export function isIpfsImageCid(value: string) {
  return CID_RE.test(value.trim());
}

export function normalizeIpfsImagePath(value: string | undefined) {
  if (value === undefined) return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 512 || trimmed.startsWith("/") || trimmed.endsWith("/")) return undefined;
  const segments = trimmed.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || !PATH_SEGMENT_RE.test(segment))) return undefined;
  return segments.join("/");
}

export function resolveIpfsImageUrl(cid: string, chainId = 56, path?: string) {
  const normalizedPath = normalizeIpfsImagePath(path);
  if (!isIpfsImageCid(cid) || normalizedPath === undefined) return undefined;
  const gateway = (getTaxVaultHostChainConfig(chainId)?.ipfsGateway ?? DEFAULT_IPFS_IMAGE_GATEWAY).replace(/\/+$/, "");
  return `${gateway}/ipfs/${cid.trim()}${normalizedPath ? `/${normalizedPath}` : ""}`;
}

export function resolveIpfsImageUrls(cid: string, chainId = 56, path?: string) {
  const normalizedPath = normalizeIpfsImagePath(path);
  if (!isIpfsImageCid(cid) || normalizedPath === undefined) return [];
  const preferred = (getTaxVaultHostChainConfig(chainId)?.ipfsGateway ?? DEFAULT_IPFS_IMAGE_GATEWAY).replace(/\/+$/, "");
  const gateways = [preferred, ...IPFS_IMAGE_GATEWAYS.map((gateway) => gateway.replace(/\/+$/, ""))];
  return [...new Set(gateways)].map((gateway) => `${gateway}/ipfs/${cid.trim()}${normalizedPath ? `/${normalizedPath}` : ""}`);
}
