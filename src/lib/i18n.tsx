"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { en } from "@/locales/en";
import { zh, type Translations } from "@/locales/zh";

type Language = "en" | "zh";

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextType | null>(null);

const translations: Record<Language, Translations> = { en, zh };

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("onfire-lang");
      if (saved === "en" || saved === "zh") return saved;
      const browserLang = navigator.language.toLowerCase();
      return browserLang.startsWith("zh") ? "zh" : "en";
    }
    return "en";
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== "undefined") {
      localStorage.setItem("onfire-lang", lang);
    }
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
