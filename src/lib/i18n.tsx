"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import type { Translations } from "@/locales/zh";
import { LANGUAGE_COOKIE, type Language } from "./i18n-shared";

export { LANGUAGE_COOKIE, type Language } from "./i18n-shared";

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextType | null>(null);

/**
 * The language is resolved SERVER-SIDE (cookie, falling back to the
 * Accept-Language header) and passed in as `initialLanguage`, so SSR output
 * already matches the user's language — no hydration mismatch, no flash of
 * English before Chinese renders.
 */
export function I18nProvider({
  children,
  initialLanguage,
  initialTranslations,
}: {
  children: ReactNode;
  initialLanguage: Language;
  initialTranslations: Translations;
}) {
  const [{ language, t }, setLocale] = useState({ language: initialLanguage, t: initialTranslations });
  const dictionaries = useRef<Partial<Record<Language, Translations>>>({ [initialLanguage]: initialTranslations });
  const revision = useRef(0);

  const setLanguage = useCallback((lang: Language) => {
    const request = ++revision.current;
    const commit = (dictionary: Translations) => {
      dictionaries.current[lang] = dictionary;
      if (request !== revision.current) return;
      setLocale({ language: lang, t: dictionary });
      document.cookie = `${LANGUAGE_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
      localStorage.setItem(LANGUAGE_COOKIE, lang);
      document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    };
    const cached = dictionaries.current[lang];
    if (cached) { commit(cached); return; }
    // Only the current dictionary crosses SSR; load the other one on demand.
    void (lang === "zh" ? import("@/locales/zh").then((m) => m.zh) : import("@/locales/en").then((m) => m.en))
      .then(commit)
      .catch(() => { console.warn("OnFire could not load the selected language."); });
  }, []);

  // One-time migration for users who picked a language before the cookie
  // existed (preference used to live only in localStorage).
  useEffect(() => {
    if (document.cookie.includes(`${LANGUAGE_COOKIE}=`)) return;
    const saved = localStorage.getItem(LANGUAGE_COOKIE);
    if (saved === "en" || saved === "zh") {
      setLanguage(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

export function useTranslations() {
  const { t } = useI18n();
  return t;
}
