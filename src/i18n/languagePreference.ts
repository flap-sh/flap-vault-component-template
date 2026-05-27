export type LanguageCode = "en" | "zh";

export const DEFAULT_LANGUAGE_CODE: LanguageCode = "zh";
export const LANGUAGE_STORAGE_KEY = "flap:language";
export const LANGUAGE_COOKIE_KEY = "flap_language";
export const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function normalizeLanguageCode(value?: string | null): LanguageCode | null {
  return value === "en" || value === "zh" ? value : null;
}

export function getLanguageCodeFromAcceptLanguage(acceptLanguage?: string | null): LanguageCode {
  const preferredLanguage = acceptLanguage?.split(",")[0]?.trim().toLowerCase();
  if (preferredLanguage?.startsWith("zh")) return "zh";
  if (preferredLanguage?.startsWith("en")) return "en";
  return DEFAULT_LANGUAGE_CODE;
}
