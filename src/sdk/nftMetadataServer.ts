import { getTaxVaultHostChainConfig } from "./hostRuntimeConfig";
import { normalizeInlineNftImage, parseInlineNftMetadata, sanitizeNftMetadataRecord } from "./nftMetadata";
import { assertPublicHttpsUrl, fetchPublicHttps } from "./publicHttpsFetch";
import type { NftMetadataSnapshot, NftMetadataSource } from "./types";

const DEFAULT_IPFS_GATEWAY = "https://flap.mypinata.cloud";
const CID_RE = /^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/;
const IPFS_PATH_SEGMENT_RE = /^[A-Za-z0-9._~%-]+$/;
const MAX_REMOTE_METADATA_BYTES = 512 * 1024;
const MAX_REMOTE_IMAGE_BYTES = 3_000_000;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 8_000;
const ALLOWED_IMAGE_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/svg+xml"]);
const PINATA_GATEWAY_SUFFIX = ".mypinata.cloud";
const PINATA_PUBLIC_GATEWAY = "https://gateway.pinata.cloud";

export interface LoadNftMetadataInput {
  chainId: number;
  tokenUri?: string;
  imageUri?: string;
  fetchImpl?: typeof fetch;
}

interface LimitedResponse {
  bytes: Uint8Array;
  contentType: string;
  finalUrl: string;
}

function sourceForUri(value: string): NftMetadataSource {
  if (value.trim().startsWith("data:")) return "data-json";
  return /^https:\/\//i.test(value.trim()) ? "https" : "ipfs";
}

function parseIpfsPath(value: string) {
  const trimmed = value.trim();
  const raw = trimmed.startsWith("ipfs://") ? trimmed.slice("ipfs://".length).replace(/^ipfs\//, "") : trimmed;
  if (!raw || raw.includes("?") || raw.includes("#") || raw.startsWith("/") || raw.endsWith("/")) return null;
  const segments = raw.split("/");
  const cid = segments.shift();
  if (!cid || !CID_RE.test(cid)) return null;
  if (
    segments.some((segment) => {
      if (!segment || !IPFS_PATH_SEGMENT_RE.test(segment)) return true;
      let decoded: string;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        return true;
      }
      return !decoded || decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\") || /[\u0000-\u001f\u007f]/.test(decoded);
    })
  ) return null;
  return [cid, ...segments].join("/");
}

function configuredIpfsGatewayUrl(ipfsPath: string, chainId: number) {
  const gateway = (getTaxVaultHostChainConfig(chainId)?.ipfsGateway ?? DEFAULT_IPFS_GATEWAY).replace(/\/+$/, "");
  return new URL(`${gateway}/ipfs/${ipfsPath}`);
}

function parsePinataGatewayIpfsPath(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !hostname.endsWith(PINATA_GATEWAY_SUFFIX) ||
    !url.pathname.startsWith("/ipfs/")
  ) return null;
  return parseIpfsPath(url.pathname.slice("/ipfs/".length));
}

function resolveResourceUrl(value: string, chainId: number, baseUrl?: string) {
  const trimmed = value.trim();
  const ipfsPath = parseIpfsPath(trimmed);
  if (ipfsPath) return configuredIpfsGatewayUrl(ipfsPath, chainId);
  const pinataIpfsPath = parsePinataGatewayIpfsPath(trimmed);
  if (pinataIpfsPath) return new URL(`${PINATA_PUBLIC_GATEWAY}/ipfs/${pinataIpfsPath}`);
  if (/^https:\/\//i.test(trimmed)) return new URL(trimmed);
  if (baseUrl && !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return new URL(trimmed, baseUrl);
  throw new Error("NFT metadata resource URI must be data JSON, IPFS, or HTTPS.");
}

async function readLimitedBody(response: Response, maxBytes: number) {
  const rawLength = response.headers.get("content-length");
  if (rawLength && Number(rawLength) > maxBytes) throw new Error("NFT metadata resource is too large.");
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("NFT metadata resource is too large.");
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function fetchLimitedResource(initialUrl: URL, maxBytes: number, fetchImpl: typeof fetch): Promise<LimitedResponse> {
  let url = initialUrl;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    assertPublicHttpsUrl(url);
    const response = await fetchImpl(url, {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: "application/json,image/*;q=0.9,*/*;q=0.1" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("NFT metadata resource redirect is invalid.");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error(`NFT metadata resource returned ${response.status}.`);
    return {
      bytes: await readLimitedBody(response, maxBytes),
      contentType: response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "",
      finalUrl: url.toString(),
    };
  }
  throw new Error("NFT metadata resource redirected too many times.");
}

function bytesToDataUrl(bytes: Uint8Array, mediaType: string) {
  return `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}

function assertSafeSvg(bytes: Uint8Array) {
  const svg = new TextDecoder().decode(bytes);
  if (!/<svg(?:\s|>)/i.test(svg)) throw new Error("NFT SVG image is malformed.");
  const blockedMarkup = /<(?:script|foreignObject|iframe|object|embed|image|use)\b|\bon[a-z]+\s*=|\b(?:href|xlink:href)\s*=\s*["'](?!#)|javascript:|@import|url\(\s*["']?(?!#)/i;
  if (blockedMarkup.test(svg)) throw new Error("NFT SVG image contains unsupported active or external content.");
}

async function resolveImage(imageUri: string, chainId: number, fetchImpl: typeof fetch, baseUrl?: string) {
  const inlineImage = normalizeInlineNftImage(imageUri);
  if (inlineImage) return inlineImage;
  const response = await fetchLimitedResource(resolveResourceUrl(imageUri, chainId, baseUrl), MAX_REMOTE_IMAGE_BYTES, fetchImpl);
  if (!ALLOWED_IMAGE_MEDIA_TYPES.has(response.contentType)) throw new Error("NFT image response uses an unsupported content type.");
  if (response.contentType === "image/svg+xml") assertSafeSvg(response.bytes);
  return {
    imageDataUrl: bytesToDataUrl(response.bytes, response.contentType),
    imageMediaType: response.contentType,
  };
}

export async function loadNftMetadata(input: LoadNftMetadataInput): Promise<NftMetadataSnapshot> {
  if (!Number.isInteger(input.chainId) || input.chainId <= 0) throw new Error("NFT metadata requires a valid chainId.");
  const hasTokenUri = typeof input.tokenUri === "string" && Boolean(input.tokenUri.trim());
  const hasImageUri = typeof input.imageUri === "string" && Boolean(input.imageUri.trim());
  if (hasTokenUri === hasImageUri) throw new Error("Provide exactly one NFT tokenUri or imageUri.");
  const fetchImpl = input.fetchImpl ?? fetchPublicHttps;

  if (hasImageUri) {
    const imageUri = input.imageUri!.trim();
    return {
      tokenUri: "",
      source: sourceForUri(imageUri),
      ...(await resolveImage(imageUri, input.chainId, fetchImpl)),
    };
  }

  const tokenUri = input.tokenUri!.trim();
  const inlineMetadata = parseInlineNftMetadata(tokenUri);
  if (inlineMetadata) {
    return {
      tokenUri,
      source: "data-json",
      name: inlineMetadata.name,
      description: inlineMetadata.description,
      attributes: inlineMetadata.attributes,
      ...(await resolveImage(inlineMetadata.imageUri, input.chainId, fetchImpl)),
    };
  }

  const metadataResponse = await fetchLimitedResource(resolveResourceUrl(tokenUri, input.chainId), MAX_REMOTE_METADATA_BYTES, fetchImpl);
  let metadataJson: unknown;
  try {
    metadataJson = JSON.parse(new TextDecoder().decode(metadataResponse.bytes));
  } catch {
    throw new Error("NFT metadata response is not valid JSON.");
  }
  const metadata = sanitizeNftMetadataRecord(metadataJson);
  return {
    tokenUri,
    source: sourceForUri(tokenUri),
    name: metadata.name,
    description: metadata.description,
    attributes: metadata.attributes,
    ...(await resolveImage(metadata.imageUri, input.chainId, fetchImpl, metadataResponse.finalUrl)),
  };
}
