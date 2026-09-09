"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/components/ui/theme-provider";
import { Languages, Moon, Sun, UserRound } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OnFireLogo } from "@/components/brand/onfire-logo";

interface TocHeaderProps {
  productName?: string | null;
  customerEmail?: string | null;
  /** Show skeleton placeholders while whoami is loading. */
  loading?: boolean;
  /** Product-enabled content languages. A single language hides the switch. */
  languages?: string[];
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

function LanguageToggle({ label, languages }: { label: string; languages: string[] }) {
  const { language, setLanguage } = useI18n();
  const supported = languages.filter(
    (item): item is "en" | "zh" => item === "en" || item === "zh"
  );

  useEffect(() => {
    if (supported.length > 0 && !supported.includes(language)) {
      setLanguage(supported[0]);
    }
  }, [language, setLanguage, supported.join(",")]);

  if (supported.length < 2) return null;
  const next = supported.find((item) => item !== language) ?? supported[0];

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
      onClick={() => setLanguage(next)}
      aria-label={label}
      title={label}
    >
      <Languages className="size-4" />
      <span className="text-xs font-medium">
        {next === "zh" ? "中文" : "EN"}
      </span>
    </Button>
  );
}

export function TocHeader({ productName, customerEmail, loading, languages }: TocHeaderProps) {
  const { t } = useI18n();

  return (
    <header data-toast-header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <OnFireLogo label="OnFire" />
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
          <div
            className={cn(
              "mr-1 hidden w-40 items-center gap-1.5 truncate rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground sm:inline-flex",
              !loading && !customerEmail && "invisible",
            )}
          >
            {loading ? (
              <Skeleton className="h-3 w-28" />
            ) : customerEmail ? (
              <>
                <UserRound className="size-3 shrink-0" />
                <span className="truncate">{customerEmail}</span>
              </>
            ) : (
              <span className="h-3 w-28" aria-hidden="true" />
            )}
          </div>
          {languages && (
            <LanguageToggle label={t.toc.header.switchLanguage} languages={languages} />
          )}
          <ThemeToggle label={t.toc.header.toggleTheme} />
        </div>
      </div>
    </header>
  );
}
