import { isIpfsImageCid, resolveIpfsImageUrl } from "./ipfsImage";
import type { IpfsUploadResult, MediaUploadRequest, MediaUploader } from "./types";

export const MAX_IMAGE_UPLOAD_BYTES = 3 * 1024 * 1024;
export const MAX_TEXT_UPLOAD_BYTES = 256 * 1024;
export const IMAGE_UPLOAD_MEDIA_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
export const RUNTIME_UPLOAD_ENDPOINT = "/api/runtime/upload";

export class MediaUploadError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "MediaUploadError";
    this.code = code;
    this.status = status;
  }
}

export function validateMediaUpload(request: MediaUploadRequest) {
  const { kind, file } = request;
  if (kind !== "image" && kind !== "text") throw new MediaUploadError("UPLOAD_INVALID_KIND", "Expected an image or text upload.", 400);
  if (!Number.isSafeInteger(request.chainId) || request.chainId <= 0) throw new MediaUploadError("UPLOAD_INVALID_CHAIN", "Expected a valid runtime chain ID.", 400);
  if (!(file instanceof Blob) || file.size === 0) throw new MediaUploadError("UPLOAD_EMPTY", "Upload content is empty.", 400);
  const maxBytes = kind === "image" ? MAX_IMAGE_UPLOAD_BYTES : MAX_TEXT_UPLOAD_BYTES;
  if (file.size > maxBytes) throw new MediaUploadError("UPLOAD_TOO_LARGE", `Upload exceeds ${maxBytes} bytes.`, 413);
  const supported = kind === "image"
    ? (IMAGE_UPLOAD_MEDIA_TYPES as readonly string[]).includes(file.type)
    : file.type === "text/plain" || file.type === "text/plain;charset=utf-8";
  if (!supported) throw new MediaUploadError("UPLOAD_UNSUPPORTED_TYPE", "Unsupported upload media type.", 415);
}

export function createIpfsUploadResult(cid: unknown, chainId: number): IpfsUploadResult {
  if (typeof cid !== "string" || cid.length > 128 || cid !== cid.trim() || !isIpfsImageCid(cid)) {
    throw new MediaUploadError("UPLOAD_INVALID_RESPONSE", "Upload service returned an invalid file CID.", 502);
  }
  return { cid, uri: `ipfs://${cid}`, gatewayUrl: resolveIpfsImageUrl(cid, chainId)! };
}

/** Host helper. Components should call sdk.uploadImage / sdk.uploadText. */
export function createLocalMediaUploader(options: { fetchImpl?: typeof fetch } = {}): MediaUploader {
  return async (request) => {
    validateMediaUpload(request);
    const body = new FormData();
    body.set("kind", request.kind);
    body.set("chainId", String(request.chainId));
    body.set("file", request.file, request.kind === "image" ? "image" : "text.txt");
    let response: Response;
    try {
      response = await (options.fetchImpl ?? fetch)(RUNTIME_UPLOAD_ENDPOINT, {
        method: "POST",
        body,
        signal: request.signal,
        credentials: "same-origin",
        cache: "no-store",
      });
    } catch (error) {
      if (request.signal?.aborted) throw error;
      throw new MediaUploadError("UPLOAD_NETWORK_ERROR", "Could not reach the upload service.");
    }
    let payload: { data?: { cid?: unknown }; code?: unknown };
    try {
      payload = await response.json();
    } catch {
      throw new MediaUploadError("UPLOAD_INVALID_RESPONSE", "Upload service returned an invalid response.", response.status);
    }
    if (!response.ok) {
      throw new MediaUploadError(typeof payload?.code === "string" ? payload.code : "UPLOAD_FAILED", "Upload failed.", response.status);
    }
    return createIpfsUploadResult(payload?.data?.cid, request.chainId);
  };
}
