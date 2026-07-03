"use client";

import { AlertCircle, Clock } from "lucide-react";
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

interface CredentialErrorProps {
  /** "missing" — no/partial credentials; "expired" — token rejected (401). */
  variant?: "missing" | "expired";
  missingFields?: ("productId" | "token")[];
}

export function CredentialError({
  variant = "missing",
  missingFields = [],
}: CredentialErrorProps) {
  const { t } = useI18n();
  const showDebugDetails = featureFlags.showDebugDetails();
  const expired = variant === "expired";
  const Icon = expired ? Clock : AlertCircle;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg items-start px-4 py-20 sm:py-24">
      <Alert variant="destructive" className="border-destructive/50">
        <Icon />
        <AlertTitle>
          {expired
            ? t.toc.errors.sessionExpired
            : t.toc.errors.configurationError}
        </AlertTitle>
        <AlertDescription className="gap-2">
          <p>
            {expired
              ? t.toc.errors.sessionExpiredMessage
              : t.toc.errors.missingCredentialsMessage}
          </p>
          <p className="text-destructive/80">
            {expired
              ? t.toc.errors.sessionExpiredHint
              : t.toc.errors.contactProvider}
          </p>

          {showDebugDetails && !expired && missingFields.length > 0 && (
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
