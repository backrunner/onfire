"use client";

import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { featureFlags } from "@/lib/feature-flags";

interface CredentialErrorProps {
  missingFields: ("productId" | "token")[];
}

export function CredentialError({ missingFields }: CredentialErrorProps) {
  const { t } = useI18n();
  const [showDetails, setShowDetails] = useState(false);
  const showDebugDetails = featureFlags.showDebugDetails();

  return (
    <div className="max-w-md mx-auto mt-20">
      <Card className="border-destructive/50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-destructive">
              {t.toc.errors.configurationError}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            {t.toc.errors.missingCredentialsMessage}
          </p>
          <p className="text-sm text-muted-foreground">
            {t.toc.errors.contactProvider}
          </p>

          {showDebugDetails && (
            <div className="pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between text-muted-foreground"
                onClick={() => setShowDetails(!showDetails)}
              >
                {t.toc.errors.technicalDetails}
                {showDetails ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
              {showDetails && (
                <div className="mt-2 p-3 bg-muted rounded-md text-sm font-mono">
                  <p className="text-muted-foreground mb-1">Missing:</p>
                  <ul className="list-disc list-inside">
                    {missingFields.map((field) => (
                      <li key={field} className="text-destructive">
                        {field}
                      </li>
                    ))}
                  </ul>
                  <p className="text-muted-foreground mt-2 text-xs">
                    URL format: ?productId=xxx&token=yyy
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
