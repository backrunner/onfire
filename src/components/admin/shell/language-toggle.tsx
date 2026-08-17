"use client";

import { useI18n } from "@/lib/i18n";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LanguageToggle() {
  const { t, language, setLanguage } = useI18n();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 gap-1.5 px-2 text-xs font-medium"
      onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
      aria-label={t.common.switchLanguage}
    >
      <Languages className="size-4" />
      {language === "zh" ? "EN" : "中"}
    </Button>
  );
}
