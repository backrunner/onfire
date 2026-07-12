"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ArrowUpRight, Clock, Loader2 } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { useI18n } from "@/lib/i18n";
import { featureFlags } from "@/lib/feature-flags";
import { Button } from "@/components/ui/button";
import { tocPath } from "@/lib/toc-path";

interface CredentialErrorProps {
  /** "missing" — no/partial credentials; "expired" — token rejected (401). */
  variant?: "missing" | "expired" | "identity";
  productId?: string | null;
  missingFields?: ("productId" | "token")[];
}

export function CredentialError({
  variant = "missing",
  productId = null,
  missingFields = [],
}: CredentialErrorProps) {
  const { t } = useI18n();
  const showDebugDetails = featureFlags.showDebugDetails();
  const expired = variant === "expired";
  const identity = variant === "identity";
  const sessionIssue = expired || identity;
  const Icon = sessionIssue ? Clock : AlertCircle;
  const [returnUrl, setReturnUrl] = useState<string | null | undefined>(
    undefined
  );

  useEffect(() => {
    if (!sessionIssue) return;
    if (!productId) {
      setReturnUrl(null);
      return;
    }
    let cancelled = false;
    fetch(
      tocPath(`/api/toc/portal-config?productId=${encodeURIComponent(productId)}`)
    )
      .then(async (response) => {
        if (!response.ok) return null;
        const body = (await response.json()) as {
          ok?: boolean;
          data?: { redirectUrl?: string | null };
        };
        return body.ok ? body.data?.redirectUrl ?? null : null;
      })
      .then((url) => {
        if (!cancelled) setReturnUrl(url);
      })
      .catch(() => {
        if (!cancelled) setReturnUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionIssue, productId]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg items-start px-4 py-20 sm:py-24">
      <Alert
        variant="destructive"
        className="border-destructive/40 bg-destructive/[0.03] dark:border-destructive/45 dark:bg-destructive/20"
      >
        <Icon />
        <AlertTitle>
          {sessionIssue
            ? identity
              ? t.toc.errors.identityRejected
              : t.toc.errors.sessionExpired
            : t.toc.errors.configurationError}
        </AlertTitle>
        <AlertDescription className="gap-2">
          <p>
            {sessionIssue
              ? identity
                ? t.toc.errors.identityRejectedMessage
                : t.toc.errors.sessionExpiredMessage
              : t.toc.errors.missingCredentialsMessage}
          </p>
          <p className="text-destructive/80">
            {sessionIssue
              ? identity
                ? t.toc.errors.identityRejectedHint
                : t.toc.errors.sessionExpiredHint
              : t.toc.errors.contactProvider}
          </p>

          {sessionIssue && (
            returnUrl === undefined ? (
              <Button disabled size="sm" className="mt-2 w-full sm:w-auto">
                <Loader2 className="size-3.5 animate-spin" />
                {t.toc.errors.returnToProduct}
              </Button>
            ) : (
              <Button asChild size="sm" className="mt-2 w-full sm:w-auto">
                <a href={returnUrl ?? tocPath("/")}>
                  {t.toc.errors.returnToProduct}
                  <ArrowUpRight className="size-3.5" />
                </a>
              </Button>
            )
          )}

          {showDebugDetails && !sessionIssue && missingFields.length > 0 && (
            <Accordion
              type="single"
              collapsible
              className="mt-1 w-full"
            >
              <AccordionItem
                value="technical-details"
                className="border-t border-b-0 border-destructive/20"
              >
                <AccordionTrigger className="py-3 text-xs text-destructive/80">
                  {t.toc.errors.technicalDetails}
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pb-0 text-xs">
                  <p className="font-medium">Missing:</p>
                  <div className="font-mono">
                    <ul className="list-inside list-disc">
                      {missingFields.map((field) => (
                        <li key={field}>{field}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-destructive/80">
                      URL format: ?productId=xxx&token=yyy
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}
