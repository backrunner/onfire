"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { en } from "@/locales/en";
import { zh, type Translations } from "@/locales/zh";

export type Language = "en" | "zh";

export const LANGUAGE_COOKIE = "onfire-lang";

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextType | null>(null);

const translations: Record<Language, Translations> = { en, zh };

/**
 * The language is resolved SERVER-SIDE (cookie, falling back to the
 * Accept-Language header) and passed in as `initialLanguage`, so SSR output
 * already matches the user's language — no hydration mismatch, no flash of
 * English before Chinese renders.
 */
export function I18nProvider({
  children,
  initialLanguage,
}: {
  children: ReactNode;
  initialLanguage?: Language;
}) {
  const [language, setLanguageState] = useState<Language>(
    initialLanguage ?? "en"
  );

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    document.cookie = `${LANGUAGE_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
    localStorage.setItem(LANGUAGE_COOKIE, lang);
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
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

  const t = translations[language];

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
