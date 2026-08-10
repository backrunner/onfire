"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTocCredentials } from "@/lib/hooks/use-toc-credentials";
import { tocApi } from "@/lib/api/toc-client";
import type { TocWhoAmI } from "@/lib/toc/portal";
import { CredentialError } from "./credential-error";
import { TocHeader } from "./toc-header";

/**
 * Shared ToC page chrome: gates on stored credentials (sessionStorage),
 * shows the missing/expired error screens, loads whoami for the header,
 * and renders children inside the centered max-w-2xl column.
 */
export function TocPortalShell({ children }: { children: ReactNode }) {
  const {
    isLoading,
    isValid,
    isExpired,
    isIdentityError,
    productId,
    missingFields,
  } =
    useTocCredentials();
  const [whoami, setWhoami] = useState<TocWhoAmI | null>(null);
  const [whoamiLoading, setWhoamiLoading] = useState(true);

  useEffect(() => {
    if (!isValid) return;
    let cancelled = false;
    setWhoamiLoading(true);
    tocApi
      .get<TocWhoAmI>("/api/toc/whoami")
      .then((data) => {
        if (!cancelled) setWhoami(data);
      })
      .catch(() => {
        // 401 is signalled globally via the session-expired event;
        // other failures just leave the header in its default state.
      })
      .finally(() => {
        if (!cancelled) setWhoamiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isValid]);

  if (isLoading) {
    // URL/session inspection is local and normally completes before paint.
    // Keep the SSR fallback visually neutral so invalid bootstrap links do
    // not flash a misleading application skeleton before the error screen.
    return <div className="min-h-screen bg-muted/40 dark:bg-background" />;
  }

  if (isExpired) {
    return <CredentialError variant="expired" productId={productId} />;
  }

  if (isIdentityError) {
    return <CredentialError variant="identity" productId={productId} />;
  }

  if (!isValid) {
    return <CredentialError variant="missing" missingFields={missingFields} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted/40 dark:bg-background">
      <TocHeader
        productName={whoami?.productName}
        customerEmail={whoami?.displayName ?? whoami?.email}
        loading={whoamiLoading && !whoami}
      />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {children}
      </main>
      <footer className="pb-6 pt-2 text-center text-xs text-muted-foreground/60">
        Powered by OnFire
      </footer>
    </div>
  );
}
