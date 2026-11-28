import { normalizeCardImageUrl } from "./cardImageUrl.mjs";

const MAX_CARD_IMAGE_BYTES = 8 * 1024 * 1024;
const RASTER_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export async function fetchCardImage(src: string, signal: AbortSignal, fetchImpl = fetch): Promise<Blob> {
  const url = normalizeCardImageUrl(src);
  if (!url) throw new Error("Invalid card image URL.");

  const response = await fetchImpl(url, {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer",
    signal,
  });
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  if (
    !response.ok || response.redirected || !response.body ||
    !RASTER_MEDIA_TYPES.has(contentType) ||
    Number(response.headers.get("content-length")) > MAX_CARD_IMAGE_BYTES
  ) {
    void response.body?.cancel().catch(() => {});
    throw new Error("Invalid card image response.");
  }

  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_CARD_IMAGE_BYTES) throw new Error("Card image is too large.");
      chunks.push(chunk.value.slice());
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (bytes === 0) throw new Error("Card image is empty.");
  return new Blob(chunks, { type: contentType });
}
