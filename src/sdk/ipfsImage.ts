import { getTaxVaultHostChainConfig } from "./hostRuntimeConfig";

const DEFAULT_IPFS_IMAGE_GATEWAY = "https://flap.mypinata.cloud";
const IPFS_IMAGE_GATEWAYS = ["https://flap.mypinata.cloud", "https://magenta-naval-penguin-822.mypinata.cloud"] as const;
const CID_RE = /^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/;

export function isIpfsImageCid(value: string) {
  return CID_RE.test(value.trim());
}

export function resolveIpfsImageUrl(cid: string, chainId = 56) {
  if (!isIpfsImageCid(cid)) return undefined;
  const gateway = (getTaxVaultHostChainConfig(chainId)?.ipfsGateway ?? DEFAULT_IPFS_IMAGE_GATEWAY).replace(/\/+$/, "");
  return `${gateway}/ipfs/${cid.trim()}`;
}

export function resolveIpfsImageUrls(cid: string, chainId = 56) {
  if (!isIpfsImageCid(cid)) return [];
  const preferred = (getTaxVaultHostChainConfig(chainId)?.ipfsGateway ?? DEFAULT_IPFS_IMAGE_GATEWAY).replace(/\/+$/, "");
  const gateways = [preferred, ...IPFS_IMAGE_GATEWAYS.map((gateway) => gateway.replace(/\/+$/, ""))];
  return [...new Set(gateways)].map((gateway) => `${gateway}/ipfs/${cid.trim()}`);
}
