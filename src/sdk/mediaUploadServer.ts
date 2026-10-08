import { createIpfsUploadResult, MAX_IMAGE_UPLOAD_BYTES, MediaUploadError, validateMediaUpload } from "./mediaUpload";
import type { MediaUploadRequest } from "./types";

const MAX_MULTIPART_BYTES = MAX_IMAGE_UPLOAD_BYTES + 64 * 1024;
const PINATA_UPLOAD_ENDPOINT = "https://api.pinata.cloud/pinning/pinFileToIPFS";

async function readLimitedBytes(body: ReadableStream<Uint8Array> | null, limit: number) {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel().catch(() => undefined);
        throw new MediaUploadError("UPLOAD_TOO_LARGE", "Upload request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function validateContent({ kind, file }: MediaUploadRequest) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (kind === "text") {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new MediaUploadError("UPLOAD_INVALID_TEXT", "Text must use UTF-8 encoding.", 400);
    }
    return;
  }
  const startsWith = (prefix: number[]) => prefix.every((value, index) => bytes[index] === value);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  const matches = {
    "image/png": startsWith([137, 80, 78, 71, 13, 10, 26, 10]),
    "image/jpeg": startsWith([255, 216, 255]),
    "image/gif": ["GIF87a", "GIF89a"].includes(ascii(0, 6)),
    "image/webp": ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP",
  };
  if (!matches[file.type as keyof typeof matches]) {
    throw new MediaUploadError("UPLOAD_INVALID_IMAGE", "Image content does not match its media type.", 415);
  }
}

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

export interface RuntimeUploadHandlerOptions {
  /** Server-only credential. Never pass this to a browser provider or component. */
  pinataJwt?: string;
  /** Preview hosts may relay to the Flap host without holding pinning credentials. */
  upstreamOrigin?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Bounded, same-origin file upload. The host owns authentication/rate-limit policy. */
export function createRuntimeUploadHandler(options: RuntimeUploadHandlerOptions) {
  const requests = new Map<string, { count: number; resetAt: number }>();
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return json({ code: "UPLOAD_ORIGIN_DENIED", error: "Cross-origin upload is not allowed." }, 403);
    let upstream: URL | undefined;
    if (!options.pinataJwt && options.upstreamOrigin) {
      try {
        upstream = new URL(options.upstreamOrigin);
        if (upstream.protocol !== "https:" || upstream.username || upstream.password || upstream.pathname !== "/" || upstream.search || upstream.hash || upstream.origin === new URL(request.url).origin) upstream = undefined;
      } catch { /* Invalid host configuration fails closed below. */ }
    }
    if (!options.pinataJwt && !upstream) return json({ code: "UPLOAD_NOT_CONFIGURED", error: "Upload service is not configured." }, 503);
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data;")) return json({ code: "UPLOAD_INVALID_FORM", error: "Expected multipart form data." }, 400);
    const now = Date.now();
    for (const [key, window] of requests) if (window.resetAt <= now) requests.delete(key);
    // Hosts must overwrite forwarding headers at their trusted ingress.
    const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 128) || request.headers.get("x-real-ip")?.slice(0, 128) || "unknown";
    const window = requests.get(client) ?? { count: 0, resetAt: now + 60_000 };
    if (window.count >= 10 || (!requests.has(client) && requests.size >= 1024)) {
      return Response.json({ code: "UPLOAD_RATE_LIMITED", error: "Too many uploads. Try again later." }, {
        status: 429,
        headers: { "cache-control": "no-store", "retry-after": String(Math.max(1, Math.ceil((window.resetAt - now) / 1000))) },
      });
    }
    requests.set(client, { ...window, count: window.count + 1 });
    try {
      const contentLength = Number(request.headers.get("content-length"));
      if (contentLength > MAX_MULTIPART_BYTES) throw new MediaUploadError("UPLOAD_TOO_LARGE", "Upload request is too large.", 413);
      const bytes = await readLimitedBytes(request.body, MAX_MULTIPART_BYTES);
      let form: FormData;
      try {
        form = await new Response(bytes, { headers: { "content-type": contentType } }).formData();
      } catch {
        throw new MediaUploadError("UPLOAD_INVALID_FORM", "Invalid multipart form data.", 400);
      }
      const kind = form.get("kind");
      const file = form.get("file");
      if ((kind !== "image" && kind !== "text") || !(file instanceof Blob) || [...form.keys()].some((key) => !["kind", "chainId", "file"].includes(key)) || ["kind", "chainId", "file"].some((key) => form.getAll(key).length !== 1)) {
        throw new MediaUploadError("UPLOAD_INVALID_FORM", "Expected kind, chainId and one file.", 400);
      }
      const upload: MediaUploadRequest = { kind, file, chainId: Number(form.get("chainId")) };
      validateMediaUpload(upload);
      await validateContent(upload);
      if (upstream) {
        const relayBody = new FormData();
        relayBody.set("kind", kind);
        relayBody.set("chainId", String(upload.chainId));
        relayBody.set("file", file, kind === "image" ? "image" : "text.txt");
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(options.timeoutMs ?? 35_000)]);
        try {
          const response = await (options.fetchImpl ?? fetch)(new URL("/api/runtime/upload", upstream).href, {
            method: "POST", body: relayBody, signal, redirect: "error",
          });
          const bytes = await readLimitedBytes(response.body, 16 * 1024);
          const payload = JSON.parse(new TextDecoder().decode(bytes));
          if (!response.ok) {
            const code = typeof payload?.code === "string" && /^UPLOAD_[A-Z_]{1,48}$/.test(payload.code) ? payload.code : "UPLOAD_FAILED";
            const headers: Record<string, string> = { "cache-control": "no-store" };
            if (response.status === 429) headers["retry-after"] = String(Math.min(300, Math.max(1, Number(response.headers.get("retry-after")) || 60)));
            return Response.json({ code, error: "Upload failed." }, { status: response.status, headers });
          }
          return json({ data: createIpfsUploadResult(payload?.data?.cid, upload.chainId) });
        } catch {
          return json({ code: signal.aborted ? "UPLOAD_TIMEOUT" : "UPLOAD_PROXY_FAILED", error: "Failed to reach the Flap upload service." }, signal.aborted ? 504 : 502);
        }
      }
      const pinataBody = new FormData();
      const extension = kind === "text" ? "txt" : { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" }[file.type];
      pinataBody.set("file", file, `${kind}.${extension}`);
      pinataBody.set("pinataOptions", JSON.stringify({ cidVersion: 1 }));
      const timeout = AbortSignal.timeout(options.timeoutMs ?? 30_000);
      const signal = AbortSignal.any([request.signal, timeout]);
      let pinned: { IpfsHash?: unknown };
      try {
        const response = await (options.fetchImpl ?? fetch)(PINATA_UPLOAD_ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${options.pinataJwt}` },
          body: pinataBody,
          signal,
          redirect: "error",
        });
        if (!response.ok) throw new Error("Pinning failed.");
        const responseBytes = await readLimitedBytes(response.body, 16 * 1024);
        pinned = JSON.parse(new TextDecoder().decode(responseBytes));
      } catch {
        return json({ code: signal.aborted ? "UPLOAD_TIMEOUT" : "UPLOAD_PIN_FAILED", error: "Failed to store upload." }, signal.aborted ? 504 : 502);
      }
      return json({ data: createIpfsUploadResult(pinned?.IpfsHash, upload.chainId) });
    } catch (error) {
      if (error instanceof MediaUploadError) return json({ code: error.code, error: error.message }, error.status ?? 400);
      return json({ code: "UPLOAD_FAILED", error: "Upload failed." }, 500);
    }
  };
}
