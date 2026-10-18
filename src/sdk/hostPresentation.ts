import { getAddress, isAddress } from "viem";
import { getTaxVaultHostChainConfig } from "./hostRuntimeConfig";
import type { Address, HostRuntimePresentationFetcher, HostTokenPresentation } from "./types";

const DEFAULT_FLAP_HOST_ORIGIN = "https://flap.sh";
const DEFAULT_RUNTIME_PRESENTATION_ENDPOINT = "/api/runtime/token-presentation";
const DEFAULT_IPFS_GATEWAY = "https://flap.mypinata.cloud";
const PRESENTATION_TIMEOUT_MS = 12_000;
const PRESENTATION_ATTEMPT_TIMEOUT_MS = 4_000;
const PRESENTATION_ATTEMPTS = 3;
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
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ResolveHostPresentationBatchInput {
  chainId: number;
  tokenAddresses: Address[];
  flapHostOrigin?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface LocalHostPresentationFetcherOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

function retryDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", aborted); resolve(); }, milliseconds);
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
  });
}

function transientMetadataError(error: unknown) {
  const value = error as { name?: string; message?: string; code?: string; cause?: { code?: string } } | undefined;
  if (value?.name === "TimeoutError" || value?.name === "AbortError") return true;
  const code = value?.cause?.code || value?.code;
  if (code) return /^(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|UND_ERR_(?:SOCKET|CONNECT_TIMEOUT|HEADERS_TIMEOUT|BODY_TIMEOUT))$/.test(code);
  return value?.name === "TypeError" && /fetch failed|network|failed to fetch/i.test(value.message || "");
}

function metadataPayload(value: unknown): HostMetadataResponseBody {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("data" in value)) throw new Error("Host token metadata returned an invalid response schema.");
  const payload = value as HostMetadataResponseBody;
  if (payload.data !== null && (typeof payload.data !== "object" || Array.isArray(payload.data))) throw new Error("Host token metadata returned invalid data.");
  return payload;
}

// This specific POST is a public read-only metadata query, never a wallet/write request.
async function fetchHostMetadata(input: ResolveHostPresentationInput | ResolveHostPresentationBatchInput, origin: string, chain: string, addresses: Address[]) {
  const timeoutMs = Number.isFinite(input.timeoutMs) && input.timeoutMs! > 0 ? Math.min(input.timeoutMs!, PRESENTATION_TIMEOUT_MS) : PRESENTATION_TIMEOUT_MS;
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new DOMException("Host token metadata request timed out.", "TimeoutError")), timeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, deadline.signal]) : deadline.signal;
  const fetchImpl = input.fetchImpl ?? fetch;
  const started = Date.now();
  try {
    for (let attempt = 0; attempt < PRESENTATION_ATTEMPTS; attempt++) {
      signal.throwIfAborted();
      const attemptController = new AbortController();
      const attemptTimer = setTimeout(() => attemptController.abort(new DOMException("Host token metadata attempt timed out.", "TimeoutError")), Math.min(PRESENTATION_ATTEMPT_TIMEOUT_MS, Math.max(1, timeoutMs - (Date.now() - started))));
      const attemptSignal = AbortSignal.any([signal, attemptController.signal]);
      let payload: unknown;
      let parsed = false;
      let delay = 200 * (attempt + 1);
      try {
        const response = await withAbort<Response>(Promise.resolve().then(() => fetchImpl(`${origin}/api/tax-dashboard/metadata`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chain, addresses: addresses.map((address) => address.toLowerCase()) }),
          cache: "no-store",
          signal: attemptSignal,
        })), attemptSignal);
        if (response.ok) {
          payload = await withAbort(response.json(), attemptSignal);
          parsed = true;
        } else {
          const retryable = response.status === 429 || (response.status >= 500 && response.status < 600);
          const status = response.status;
          const retryAfter = Number(response.headers.get("retry-after"));
          if (Number.isFinite(retryAfter) && retryAfter > 0) delay = Math.min(1000, retryAfter * 1000);
          await withAbort(Promise.resolve(response.body?.cancel()), attemptSignal);
          if (!retryable || attempt === PRESENTATION_ATTEMPTS - 1) throw new Error(`Host token metadata request returned HTTP ${status}.`);
        }
      } catch (error) {
        signal.throwIfAborted();
        if (!transientMetadataError(error) || attempt === PRESENTATION_ATTEMPTS - 1) throw error;
      } finally {
        clearTimeout(attemptTimer);
      }
      if (parsed) return metadataPayload(payload);
      await retryDelay(delay, signal);
    }
    throw new Error("Host token metadata request failed after bounded retries.");
  } finally {
    clearTimeout(timer);
  }
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
  const payload = await fetchHostMetadata(input, flapHostOrigin, chainSlug, [tokenAddress]);
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
  const payload = await fetchHostMetadata(input, flapHostOrigin, chainSlug, normalizedAddresses);
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
      signal: options.signal,
    });
    if (!response.ok) throw new Error(`Local token presentation request returned HTTP ${response.status}.`);

    const payload = (await response.json()) as { data?: unknown } | null;
    return parsePresentationPayload(payload?.data);
  };
}
