import { getAddress, isAddress } from "viem";
import { getTaxVaultHostChainConfig } from "./hostRuntimeConfig";
import type { Address, HostRuntimePresentationFetcher, HostTokenPresentation } from "./types";

const DEFAULT_FLAP_HOST_ORIGIN = "https://flap.sh";
const DEFAULT_RUNTIME_PRESENTATION_ENDPOINT = "/api/runtime/token-presentation";
const DEFAULT_IPFS_GATEWAY = "https://flap.mypinata.cloud";
const LEGACY_IPFS_GATEWAY_HOSTS = new Set([
  "cf-ipfs.com",
  "pump.mypinata.cloud",
  "gateway.pinata.cloud",
  "flap.mypinata.cloud",
  "magenta-naval-penguin-822.mypinata.cloud",
]);

interface HostMetadataResponseItem {
  address?: string;
  name?: string;
  symbol?: string;
  metadata?: {
    image?: string;
    description?: string;
  };
}

interface HostMetadataResponseBody {
  data?: Record<string, HostMetadataResponseItem> | null;
}

export interface ResolveHostPresentationInput {
  chainId: number;
  tokenAddress: Address;
  flapHostOrigin?: string;
  fetchImpl?: typeof fetch;
}

export interface ResolveHostPresentationBatchInput {
  chainId: number;
  tokenAddresses: Address[];
  flapHostOrigin?: string;
  fetchImpl?: typeof fetch;
}

export interface LocalHostPresentationFetcherOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

function normalizeOrigin(origin?: string) {
  if (!origin) return DEFAULT_FLAP_HOST_ORIGIN;
  return origin.replace(/\/+$/, "");
}

function normalizeAddress(address: string): Address | null {
  return isAddress(address) ? (getAddress(address) as Address) : null;
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveHostChainSlug(chainId: number) {
  return getTaxVaultHostChainConfig(chainId)?.hostChainSlug;
}

function resolveIpfsGateway(chainId: number) {
  return getTaxVaultHostChainConfig(chainId)?.ipfsGateway ?? DEFAULT_IPFS_GATEWAY;
}

function rewriteToPublicIpfsGateway(rawUrl: string, chainId: number) {
  try {
    const gateway = resolveIpfsGateway(chainId);
    const parsed = new URL(rawUrl);
    if (!LEGACY_IPFS_GATEWAY_HOSTS.has(parsed.hostname)) return rawUrl;

    const publicGateway = new URL(gateway);
    parsed.protocol = publicGateway.protocol;
    parsed.host = publicGateway.host;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function wrapHostImageUrl(image: string | undefined, chainId: number) {
  const raw = normalizeString(image);
  if (!raw) return undefined;
  if (raw.startsWith("/")) return raw;
  if (raw.startsWith("https://")) return rewriteToPublicIpfsGateway(raw, chainId);
  if (raw.startsWith("http://")) return undefined;

  const gateway = resolveIpfsGateway(chainId).replace(/\/+$/, "");
  if (raw.startsWith("ipfs://")) return `${gateway}/ipfs/${raw.slice("ipfs://".length)}`;
  return `${gateway}/ipfs/${raw}`;
}

function buildTokenDetailHref(origin: string, chainSlug: string, tokenAddress: Address) {
  return `${origin}/${chainSlug}/${tokenAddress.toLowerCase()}/taxinfo`;
}

function buildChainHref(origin: string, chainSlug: string) {
  return `${origin}/${chainSlug}`;
}

function resolveMetadataItem(payload: HostMetadataResponseBody | null | undefined, tokenAddress: Address) {
  const data = payload?.data;
  if (!data || typeof data !== "object") return null;

  const checksum = getAddress(tokenAddress);
  const lower = tokenAddress.toLowerCase();
  const direct = data[checksum] ?? data[lower];
  if (direct && typeof direct === "object") return direct;

  for (const value of Object.values(data)) {
    if (!value || typeof value !== "object") continue;
    const itemAddress = normalizeString((value as HostMetadataResponseItem).address);
    if (itemAddress && normalizeAddress(itemAddress)?.toLowerCase() === lower) {
      return value;
    }
  }

  return null;
}

function toHostPresentation(chainId: number, tokenAddress: Address, flapHostOrigin: string, item: HostMetadataResponseItem | null): HostTokenPresentation | null {
  if (!item) return null;

  const chainSlug = resolveHostChainSlug(chainId);
  if (!chainSlug) return null;

  const tokenSymbol = normalizeString(item.symbol);
  const tokenName = normalizeString(item.name);
  const tokenImageUrl = wrapHostImageUrl(item.metadata?.image, chainId);

  if (!tokenSymbol && !tokenName && !tokenImageUrl) return null;

  return {
    tokenSymbol,
    tokenName,
    tokenImageUrl,
    tokenDetailHref: buildTokenDetailHref(flapHostOrigin, chainSlug, tokenAddress),
    chainHref: buildChainHref(flapHostOrigin, chainSlug),
    extraConfig: {
      hostPresentationOrigin: flapHostOrigin,
      hostPresentationChain: chainSlug,
      ...(normalizeString(item.metadata?.description) ? { tokenDescription: normalizeString(item.metadata?.description) } : {}),
    },
  };
}

export async function loadFlapHostTokenPresentation(input: ResolveHostPresentationInput): Promise<HostTokenPresentation | null> {
  const chainSlug = resolveHostChainSlug(input.chainId);
  if (!chainSlug) return null;

  const tokenAddress = normalizeAddress(input.tokenAddress);
  if (!tokenAddress) return null;

  const flapHostOrigin = normalizeOrigin(input.flapHostOrigin);
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${flapHostOrigin}/api/tax-dashboard/metadata`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chain: chainSlug,
      addresses: [tokenAddress.toLowerCase()],
    }),
    cache: "no-store",
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as HostMetadataResponseBody;
  return toHostPresentation(input.chainId, tokenAddress, flapHostOrigin, resolveMetadataItem(payload, tokenAddress));
}

export async function loadFlapHostTokenPresentationBatch(input: ResolveHostPresentationBatchInput): Promise<Record<string, HostTokenPresentation | null>> {
  const chainSlug = resolveHostChainSlug(input.chainId);
  if (!chainSlug) return {};

  const normalizedAddresses = input.tokenAddresses
    .map((tokenAddress) => normalizeAddress(tokenAddress))
    .filter((tokenAddress): tokenAddress is Address => Boolean(tokenAddress));
  if (!normalizedAddresses.length) return {};

  const flapHostOrigin = normalizeOrigin(input.flapHostOrigin);
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${flapHostOrigin}/api/tax-dashboard/metadata`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chain: chainSlug,
      addresses: normalizedAddresses.map((tokenAddress) => tokenAddress.toLowerCase()),
    }),
    cache: "no-store",
  });

  if (!response.ok) return {};

  const payload = (await response.json()) as HostMetadataResponseBody;
  return Object.fromEntries(
    normalizedAddresses.map((tokenAddress) => [
      tokenAddress,
      toHostPresentation(input.chainId, tokenAddress, flapHostOrigin, resolveMetadataItem(payload, tokenAddress)),
    ]),
  );
}

function parsePresentationPayload(payload: unknown): HostTokenPresentation | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const tokenSymbol = normalizeString(record.tokenSymbol);
  const tokenName = normalizeString(record.tokenName);
  const tokenImageUrl = normalizeString(record.tokenImageUrl);

  if (!tokenSymbol && !tokenName && !tokenImageUrl) return null;

  return {
    tokenSymbol,
    tokenName,
    tokenImageUrl,
    tokenDetailHref: normalizeString(record.tokenDetailHref),
    chainHref: normalizeString(record.chainHref),
    extraConfig: record.extraConfig && typeof record.extraConfig === "object" && !Array.isArray(record.extraConfig) ? (record.extraConfig as Record<string, unknown>) : undefined,
  };
}

export function createLocalHostPresentationFetcher(options: LocalHostPresentationFetcherOptions = {}): HostRuntimePresentationFetcher {
  const endpoint = options.endpoint ?? DEFAULT_RUNTIME_PRESENTATION_ENDPOINT;
  const fetchImpl = options.fetchImpl ?? fetch;

  return async ({ chainId, tokenAddress, factoryAddress, vaultAddress }) => {
    const query = new URLSearchParams({
      chainId: String(chainId),
      tokenAddress,
    });
    if (factoryAddress) query.set("factoryAddress", factoryAddress);
    if (vaultAddress) query.set("vaultAddress", vaultAddress);

    const response = await fetchImpl(`${endpoint}?${query.toString()}`, {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { data?: unknown } | null;
    return parsePresentationPayload(payload?.data);
  };
}
