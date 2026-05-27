"use client";

import { useLangContext } from "./LangContext";

export function useLang() {
  const { currentLang, currentLanguageCode, setLanguage, setLanguageCode } = useLangContext();

  return {
    lang: currentLang,
    languageCode: currentLanguageCode,
    changeLang: setLanguage,
    changeLanguageCode: setLanguageCode,
  };
}
