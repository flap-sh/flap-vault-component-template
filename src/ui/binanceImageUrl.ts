export const BINANCE_IMAGE_HOSTNAME = "bin.bnbstatic.com";

const MAX_BINANCE_IMAGE_URL_LENGTH = 4096;
const CONTROL_CHARACTER_RE = /[\u0000-\u001F\u007F]/u;

/**
 * Accept only absolute HTTPS image URLs on Binance's exact static asset host.
 * The pathname is intentionally unrestricted because the upstream API returns
 * assets from multiple directories.
 */
export function normalizeBinanceImageUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value || value.length > MAX_BINANCE_IMAGE_URL_LENGTH) return null;
  if (value !== value.trim() || CONTROL_CHARACTER_RE.test(value)) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return null;
    if (parsed.hostname.toLowerCase() !== BINANCE_IMAGE_HOSTNAME) return null;
    if (parsed.username || parsed.password || parsed.port) return null;
    return parsed.href;
  } catch {
    return null;
  }
}
