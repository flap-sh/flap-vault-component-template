import type {
  NftMetadataAttribute,
  NftMetadataReader,
  NftMetadataReaderRequest,
  NftMetadataSnapshot,
  NftMetadataSource,
} from "./types";

const DEFAULT_NFT_METADATA_ENDPOINT = "/api/runtime/nft-metadata";
const MAX_TOKEN_URI_LENGTH = 64 * 1024;
const MAX_INLINE_METADATA_BYTES = 512 * 1024;
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_ATTRIBUTES = 100;
const ALLOWED_IMAGE_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/svg+xml"]);

interface ParsedMetadata {
  name?: string;
  description?: string;
  attributes?: NftMetadataAttribute[];
  imageUri: string;
}

interface RuntimeNftMetadataPayload {
  data?: unknown;
}

export interface LocalNftMetadataReaderOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function decodeBase64(value: string, maxBytes: number) {
  if (!value || value.length > Math.ceil(maxBytes * 4 / 3) + 8 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error("NFT data URI is malformed or too large.");
  }
  const binary = globalThis.atob(value);
  if (binary.length > maxBytes) throw new Error("NFT data URI is too large.");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return globalThis.btoa(binary);
}

function parseDataUri(value: string, maxBytes: number) {
  const match = /^data:([^;,]+)((?:;[^,]*)?),(.*)$/s.exec(value.trim());
  if (!match) return null;
  const mediaType = match[1].toLowerCase();
  const parameters = match[2].toLowerCase();
  const payload = match[3];
  const bytes = parameters.split(";").includes("base64")
    ? decodeBase64(payload, maxBytes)
    : new TextEncoder().encode(decodeURIComponent(payload));
  if (bytes.byteLength > maxBytes) throw new Error("NFT data URI is too large.");
  return { mediaType, bytes };
}

function safeString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function safeAttributeValue(value: unknown): NftMetadataAttribute["value"] | undefined {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 512);
  return undefined;
}

function sanitizeAttributes(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const attributes = value.slice(0, MAX_ATTRIBUTES).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const attributeValue = safeAttributeValue(record.value);
    if (attributeValue === undefined) return [];
    return [{
      ...(safeString(record.trait_type, 128) ? { trait_type: safeString(record.trait_type, 128) } : {}),
      ...(safeString(record.display_type, 64) ? { display_type: safeString(record.display_type, 64) } : {}),
      value: attributeValue,
    }];
  });
  return attributes.length ? attributes : undefined;
}

export function sanitizeNftMetadataRecord(value: unknown): ParsedMetadata {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("NFT metadata must be a JSON object.");
  const record = value as Record<string, unknown>;
  const imageUri = safeString(record.image, MAX_TOKEN_URI_LENGTH);
  if (!imageUri) throw new Error("NFT metadata does not include an image value.");
  return {
    name: safeString(record.name, 256),
    description: safeString(record.description, 2048),
    attributes: sanitizeAttributes(record.attributes),
    imageUri,
  };
}

export function parseInlineNftMetadata(tokenUri: string): ParsedMetadata | null {
  const parsed = parseDataUri(tokenUri, MAX_INLINE_METADATA_BYTES);
  if (!parsed) return null;
  if (parsed.mediaType !== "application/json") throw new Error("NFT tokenURI data must use application/json.");
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(parsed.bytes));
  } catch {
    throw new Error("NFT tokenURI data does not contain valid JSON.");
  }
  return sanitizeNftMetadataRecord(value);
}

function assertSafeSvg(bytes: Uint8Array) {
  const svg = new TextDecoder().decode(bytes);
  if (!/<svg(?:\s|>)/i.test(svg)) throw new Error("NFT SVG image is malformed.");
  const blockedMarkup = /<(?:script|foreignObject|iframe|object|embed|image|use)\b|\bon[a-z]+\s*=|\b(?:href|xlink:href)\s*=\s*["'](?!#)|javascript:|@import|url\(\s*["']?(?!#)/i;
  if (blockedMarkup.test(svg)) throw new Error("NFT SVG image contains unsupported active or external content.");
}

export function normalizeInlineNftImage(imageUri: string) {
  const parsed = parseDataUri(imageUri, MAX_INLINE_IMAGE_BYTES);
  if (!parsed) return null;
  if (!ALLOWED_IMAGE_MEDIA_TYPES.has(parsed.mediaType)) throw new Error("NFT image data uses an unsupported media type.");
  if (parsed.mediaType === "image/svg+xml") assertSafeSvg(parsed.bytes);
  return {
    imageDataUrl: `data:${parsed.mediaType};base64,${encodeBase64(parsed.bytes)}`,
    imageMediaType: parsed.mediaType,
  };
}

function parseRuntimeSnapshot(value: unknown): NftMetadataSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("NFT metadata proxy returned an invalid payload.");
  const record = value as Record<string, unknown>;
  const source = record.source;
  const imageDataUrl = record.imageDataUrl;
  const imageMediaType = record.imageMediaType;
  if ((source !== "data-json" && source !== "ipfs" && source !== "https") || typeof imageDataUrl !== "string" || typeof imageMediaType !== "string") {
    throw new Error("NFT metadata proxy returned an invalid payload.");
  }
  const inlineImage = normalizeInlineNftImage(imageDataUrl);
  if (!inlineImage || inlineImage.imageMediaType !== imageMediaType) throw new Error("NFT metadata proxy returned an invalid image.");
  const tokenUri = typeof record.tokenUri === "string" ? record.tokenUri : "";
  return {
    tokenUri,
    source,
    name: safeString(record.name, 256),
    description: safeString(record.description, 2048),
    attributes: sanitizeAttributes(record.attributes),
    ...inlineImage,
  };
}

async function postRuntimeMetadata(endpoint: string, body: Record<string, unknown>, fetchImpl: typeof fetch) {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`NFT metadata proxy returned ${response.status}.`);
  const payload = (await response.json()) as RuntimeNftMetadataPayload;
  return parseRuntimeSnapshot(payload.data);
}

export function createLocalNftMetadataReader(options: LocalNftMetadataReaderOptions = {}): NftMetadataReader {
  const endpoint = options.endpoint ?? DEFAULT_NFT_METADATA_ENDPOINT;
  const fetchImpl = options.fetchImpl ?? fetch;

  return async (request: NftMetadataReaderRequest) => {
    if (!request.tokenUri || request.tokenUri.length > MAX_TOKEN_URI_LENGTH) throw new Error("NFT tokenURI is empty or too large.");
    const inlineMetadata = parseInlineNftMetadata(request.tokenUri);
    if (inlineMetadata) {
      const inlineImage = normalizeInlineNftImage(inlineMetadata.imageUri);
      if (inlineImage) {
        return {
          tokenUri: request.tokenUri,
          source: "data-json" as NftMetadataSource,
          name: inlineMetadata.name,
          description: inlineMetadata.description,
          attributes: inlineMetadata.attributes,
          ...inlineImage,
        };
      }
      const resolved = await postRuntimeMetadata(endpoint, { chainId: request.chainId, imageUri: inlineMetadata.imageUri }, fetchImpl);
      return {
        ...resolved,
        tokenUri: request.tokenUri,
        source: "data-json",
        name: inlineMetadata.name,
        description: inlineMetadata.description,
        attributes: inlineMetadata.attributes,
      };
    }

    return postRuntimeMetadata(endpoint, { chainId: request.chainId, tokenUri: request.tokenUri }, fetchImpl);
  };
}

export const nftTokenUriAbi = [
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

export const vaultV2NftAbi = [
  {
    type: "function",
    name: "nft",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;
