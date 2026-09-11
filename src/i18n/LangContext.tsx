"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import EN from "@/res/content.json";
import ZH from "@/res/content_zh.json";
import {
  DEFAULT_LANGUAGE_CODE,
  LANGUAGE_COOKIE_KEY,
  LANGUAGE_COOKIE_MAX_AGE,
  LANGUAGE_STORAGE_KEY,
  type LanguageCode,
  normalizeLanguageCode,
} from "./languagePreference";

export type Language = typeof ZH | typeof EN;

const languageByCode: Record<LanguageCode, Language> = {
  en: EN,
  zh: ZH,
};

function getLanguageCode(lang: Language): LanguageCode {
  return lang === ZH ? "zh" : "en";
}

function readStoredLanguageCode(): LanguageCode | null {
  try {
    return normalizeLanguageCode(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeLanguagePreference(languageCode: LanguageCode) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, languageCode);
  } catch {
    // Ignore unavailable storage, e.g. private mode or embedded webviews.
  }

  try {
    document.cookie = `${LANGUAGE_COOKIE_KEY}=${languageCode}; Max-Age=${LANGUAGE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
  } catch {
    // Ignore cookie write failures in restricted browser contexts.
  }
}

function readQueryLanguageCode(searchParams: { get: (name: string) => string | null }) {
  return normalizeLanguageCode(searchParams.get("lang") ?? searchParams.get("language") ?? searchParams.get("locale"));
}

type LangContextType = {
  currentLang: Language;
  currentLanguageCode: LanguageCode;
  setLanguage: (lang: Language) => void;
  setLanguageCode: (languageCode: LanguageCode) => void;
};

const LangContext = createContext<LangContextType>({
  currentLang: languageByCode[DEFAULT_LANGUAGE_CODE],
  currentLanguageCode: DEFAULT_LANGUAGE_CODE,
  setLanguage: () => undefined,
  setLanguageCode: () => undefined,
});

export function LangProvider({
  children,
  hasInitialLanguageCookie = false,
  initialLanguageCode = DEFAULT_LANGUAGE_CODE,
}: {
  children: React.ReactNode;
  hasInitialLanguageCookie?: boolean;
  initialLanguageCode?: LanguageCode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryLanguageCode = readQueryLanguageCode(searchParams);
  const normalizedInitialLanguageCode = normalizeLanguageCode(initialLanguageCode) ?? DEFAULT_LANGUAGE_CODE;
  const [currentLanguageCode, setCurrentLanguageCode] = useState<LanguageCode>(normalizedInitialLanguageCode);

  useEffect(() => {
    if (queryLanguageCode) return;
    if (hasInitialLanguageCookie) return;

    const storedLanguageCode = readStoredLanguageCode();
    if (!storedLanguageCode || storedLanguageCode === normalizedInitialLanguageCode) return;

    setCurrentLanguageCode(storedLanguageCode);
    writeLanguagePreference(storedLanguageCode);
  }, [hasInitialLanguageCookie, normalizedInitialLanguageCode, queryLanguageCode]);

  useEffect(() => {
    if (!queryLanguageCode) return;

    setCurrentLanguageCode(queryLanguageCode);
    writeLanguagePreference(queryLanguageCode);
  }, [queryLanguageCode]);

  useEffect(() => {
    document.documentElement.lang = currentLanguageCode;
  }, [currentLanguageCode]);

  const setLanguageCode = useCallback((languageCode: LanguageCode) => {
    setCurrentLanguageCode(languageCode);
    writeLanguagePreference(languageCode);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("lang", languageCode);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const setLanguage = useCallback(
    (lang: Language) => {
      setLanguageCode(getLanguageCode(lang));
    },
    [setLanguageCode],
  );

  const value = useMemo<LangContextType>(
    () => ({
      currentLang: languageByCode[currentLanguageCode],
      currentLanguageCode,
      setLanguage,
      setLanguageCode,
    }),
    [currentLanguageCode, setLanguage, setLanguageCode],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLangContext() {
  return useContext(LangContext);
}
