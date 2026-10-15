import { resolveIpfsImageUrls } from "./ipfsImage";

const MAX_TEXT_BYTES = 256 * 1024;
const MAX_CONCURRENT_READS = 6;
const MAX_PENDING_READS = 128;
const MAX_CACHED_READS = 64;
const TEXT_MEDIA_TYPES = new Set(["text/plain", "application/json", "application/octet-stream"]);

async function readTextBody(response: Response, signal: AbortSignal) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!TEXT_MEDIA_TYPES.has(contentType.split(";")[0].trim().toLowerCase())) {
    throw new Error("IPFS text must use text/plain, application/json or application/octet-stream.");
  }
  const charset = /charset\s*=\s*["']?([^;"'\s]+)/i.exec(contentType)?.[1];
  if (charset && !/^utf-?8$/i.test(charset)) throw new Error("IPFS text must use UTF-8.");
  if (Number(response.headers.get("content-length")) > MAX_TEXT_BYTES) {
    await response.body?.cancel();
    throw new Error("IPFS text exceeds 256 KiB.");
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (signal.aborted) throw new Error("IPFS text request timed out.");
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_TEXT_BYTES) throw new Error("IPFS text exceeds 256 KiB.");
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error("IPFS content is not plain UTF-8 text.");
    return text;
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

/** Internal runtime reader. Vault components use sdk.readIpfsText; gateways and limits are platform-owned. */
export function createIpfsTextReader({ fetchImpl = fetch, timeoutMs = 8_000 }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {
  const cache = new Map<string, string>();
  const pending = new Map<string, Promise<string>>();
  const waiting: Array<() => void> = [];
  let active = 0;

  async function load(urls: string[]) {
    if (active >= MAX_CONCURRENT_READS) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let lastError: unknown;
      for (const url of urls) {
        let response: Response;
        try {
          response = await fetchImpl(url, {
            method: "GET", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer",
            cache: "force-cache", signal: controller.signal,
          });
        } catch (error) {
          if (controller.signal.aborted) throw new Error("IPFS text request timed out.");
          lastError = error;
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          lastError = new Error(`IPFS text request returned ${response.status}.`);
          continue;
        }
        // A valid HTTP response must pass all content limits; do not retry rejected content.
        return await readTextBody(response, controller.signal);
      }
      throw lastError ?? new Error("IPFS text could not be loaded.");
    } finally {
      clearTimeout(timer);
      controller.abort();
      active--;
      waiting.shift()?.();
    }
  }

  return (cid: string, path?: string): Promise<string> => {
    const urls = resolveIpfsImageUrls(cid, 56, path);
    if (!urls.length) return Promise.reject(new Error("IPFS text requires a bare CID and an optional safe relative path."));
    const key = urls[0];
    const cached = cache.get(key);
    if (cached !== undefined) {
      cache.delete(key);
      cache.set(key, cached);
      return Promise.resolve(cached);
    }
    const existing = pending.get(key);
    if (existing) return existing;
    if (pending.size >= MAX_PENDING_READS) return Promise.reject(new Error("Too many IPFS text reads; paginate the content."));
    const request = load(urls).then((text) => {
      cache.set(key, text);
      if (cache.size > MAX_CACHED_READS) cache.delete(cache.keys().next().value!);
      return text;
    }).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
}
