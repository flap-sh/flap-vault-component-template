const CARD_IMAGE_HOSTNAME = "8nothtoc5ds7a0x3.public.blob.vercel-storage.com";
const CARD_IMAGE_PATH_PREFIX = "/graded-cards-renders/";
const RAW_HTTPS_PATH = /^https:\/\/[^/?#]+(\/[^?#]*)$/iu;
const UNSAFE_URL_CHARACTERS = /[\u0000-\u0020\u007f\\]/u;
const UNSAFE_PATH_ESCAPES = /%(?:0[\da-f]|1[\da-f]|25|2e|2f|5c|7f)/iu;

/** Accept only the HTTPS image URLs under the approved card image directory. */
export function normalizeCardImageUrl(value) {
  if (typeof value !== "string" || value.length > 4096 || UNSAFE_URL_CHARACTERS.test(value)) return null;
  const rawPath = RAW_HTTPS_PATH.exec(value)?.[1];
  if (
    !rawPath?.startsWith(CARD_IMAGE_PATH_PREFIX) ||
    rawPath.endsWith("/") ||
    rawPath.split("/").some(segment => segment === "." || segment === "..") ||
    UNSAFE_PATH_ESCAPES.test(rawPath)
  ) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.hostname !== CARD_IMAGE_HOSTNAME) return null;
    if (parsed.username || parsed.password || parsed.port) return null;
    return parsed.href;
  } catch {
    return null;
  }
}
