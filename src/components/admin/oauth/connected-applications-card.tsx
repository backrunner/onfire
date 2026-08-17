"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  AppWindow,
  KeyRound,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError, swrFetcher } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import type { McpPermission } from "@/lib/mcp/permissions";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConnectedApplication {
  id: string;
  client: { id: string; name: string | null; uri: string | null };
  permissions: McpPermission[];
  effectivePermissions: McpPermission[];
  resourceMode: "all" | "selected";
  tenantCount: number;
  productCount: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

export function ConnectedApplicationsCard() {
  const { t } = useI18n();
  const { data, error, isLoading, mutate } = useSWR<ConnectedApplication[]>(
    "/api/tob/oauth/grants",
    swrFetcher,
  );
  const [revoking, setRevoking] = useState<ConnectedApplication | null>(null);
  const [busy, setBusy] = useState(false);

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await api.delete(`/api/tob/oauth/grants/${revoking.id}`);
      await mutate(
        (current) => current?.filter((grant) => grant.id !== revoking.id),
        { revalidate: false },
      );
      toast.success(t.oauth.revoked);
      setRevoking(null);
    } catch (caught) {
      toast.error(
        caught instanceof ApiClientError
          ? caught.message
          : t.oauth.revokeFailed,
      );
    } finally {
      setBusy(false);
    }
  };

  const formatLastUsed = (value: string | null) => {
    if (!value) return t.oauth.neverUsed;
    return t.oauth.lastUsed.replace("{{time}}", formatDateTime(value));
  };

  const formatCount = (
    count: number,
    singular: string,
    plural: string,
  ) => (count === 1 ? singular : plural).replace("{{count}}", String(count));

  return (
    <>
      <Card className="gap-0 rounded-lg py-0">
        <CardHeader className="px-4 py-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-muted-foreground" />
            {t.oauth.connectedTitle}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t.oauth.connectedSummary}
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : error && !data ? (
            <div className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 text-center">
              <p className="text-sm text-muted-foreground">
                {t.oauth.connectedLoadFailed}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void mutate()}
              >
                <RefreshCw className="size-4" />
                {t.oauth.retry}
              </Button>
            </div>
          ) : (data?.length ?? 0) === 0 ? (
            <div className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 text-center">
              <p className="text-sm font-medium">{t.oauth.noConnectedApps}</p>
              <p className="text-xs text-muted-foreground">
                {t.oauth.noConnectedAppsHint}
              </p>
            </div>
          ) : (
            <div className="divide-y rounded-md border">
              {data!.map((grant) => {
                const clientName =
                  grant.client.name || t.oauth.unnamedApplication;
                const resourceLabel =
                  grant.resourceMode === "all"
                    ? t.oauth.allResourceAccess
                    : t.oauth.selectedResourceAccess
                        .replace(
                          "{{tenants}}",
                          formatCount(
                            grant.tenantCount,
                            t.oauth.tenantCountOne,
                            t.oauth.tenantCountOther,
                          ),
                        )
                        .replace(
                          "{{products}}",
                          formatCount(
                            grant.productCount,
                            t.oauth.productCountOne,
                            t.oauth.productCountOther,
                          ),
                        );
                return (
                  <div key={grant.id} className="flex items-start gap-3 px-3 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                      <AppWindow className="size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{clientName}</p>
                      {grant.client.uri && (
                        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                          {grant.client.uri}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="secondary" className="font-normal">
                          {resourceLabel}
                        </Badge>
                        <Badge variant="outline" className="font-normal">
                          {formatCount(
                            grant.effectivePermissions.length,
                            t.oauth.permissionCountOne,
                            t.oauth.permissionCountOther,
                          )}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                        {grant.effectivePermissions.map((permission) => (
                          <span
                            key={permission}
                            className="text-[11px] text-muted-foreground"
                          >
                            {t.oauth.permissions[permission].label}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {formatLastUsed(grant.lastUsedAt)}
                      </p>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={t.oauth.revoke}
                          onClick={() => setRevoking(grant)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t.oauth.revoke}</TooltipContent>
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(revoking)}
        onOpenChange={(open) => !open && !busy && setRevoking(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.oauth.revokeTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.oauth.revokeMessage.replace(
                "{{client}}",
                revoking?.client.name || t.oauth.unnamedApplication,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void revoke();
              }}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {t.oauth.revoke}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
