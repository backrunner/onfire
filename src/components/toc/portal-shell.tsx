"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTocCredentials } from "@/lib/hooks/use-toc-credentials";
import { tocApi } from "@/lib/api/toc-client";
import type { TocWhoAmI } from "@/lib/toc/portal";
import { CredentialError } from "./credential-error";
import { TocHeader } from "./toc-header";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared ToC page chrome: gates on stored credentials (sessionStorage),
 * shows the missing/expired error screens, loads whoami for the header,
 * and renders children inside the centered max-w-2xl column.
 */
export function TocPortalShell({ children }: { children: ReactNode }) {
  const { isLoading, isValid, isExpired, missingFields } = useTocCredentials();
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
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (isExpired) {
    return <CredentialError variant="expired" />;
  }

  if (!isValid) {
    return <CredentialError variant="missing" missingFields={missingFields} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TocHeader
        productName={whoami?.productName}
        customerEmail={whoami?.email}
        loading={whoamiLoading && !whoami}
      />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
