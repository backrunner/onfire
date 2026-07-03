"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Flame, Languages, Moon, Sun, UserRound } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface TocHeaderProps {
  productName?: string | null;
  customerEmail?: string | null;
  /** Show skeleton placeholders while whoami is loading. */
  loading?: boolean;
}

function ThemeToggle({ label }: { label: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <Button variant="ghost" size="icon" className="size-8" aria-hidden />;
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 text-muted-foreground hover:text-foreground"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label={label}
      title={label}
    >
      {resolvedTheme === "dark" ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </Button>
  );
}

function LanguageToggle({ label }: { label: string }) {
  const { language, setLanguage } = useI18n();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
      onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
      aria-label={label}
      title={label}
    >
      <Languages className="size-4" />
      <span className="text-xs font-medium">
        {language === "zh" ? "EN" : "中文"}
      </span>
    </Button>
  );
}

export function TocHeader({ productName, customerEmail, loading }: TocHeaderProps) {
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Flame className="size-4" />
          </div>
          <div className="min-w-0">
            {loading ? (
              <Skeleton className="h-4 w-28" />
            ) : (
              <h1 className="truncate text-sm font-semibold leading-tight">
                {productName || "OnFire"}
              </h1>
            )}
            <p className="text-[11px] leading-tight text-muted-foreground">
              {t.toc.header.support}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {customerEmail && (
            <span className="mr-1 hidden max-w-48 items-center gap-1.5 truncate rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground sm:inline-flex">
              <UserRound className="size-3 shrink-0" />
              <span className="truncate">{customerEmail}</span>
            </span>
          )}
          <LanguageToggle label={t.toc.header.switchLanguage} />
          <ThemeToggle label={t.toc.header.toggleTheme} />
        </div>
      </div>
    </header>
  );
}
