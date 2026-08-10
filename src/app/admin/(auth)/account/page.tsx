"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  BellRing,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  TestTube2,
  Trash2,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
import { api, ApiClientError, swrFetcher } from "@/lib/api/client";
import {
  CHANNEL_ICONS,
  type EndpointView,
} from "@/components/admin/notifications/channel-meta";
import { EndpointDialog } from "@/components/admin/notifications/endpoint-dialog";
import { EndpointTestDialog } from "@/components/admin/notifications/endpoint-test-dialog";
import { SecuritySettingsDialog } from "@/components/admin/account/security-settings-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
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

export default function AdminAccountPage() {
  const { t } = useI18n();
  const { me, isLoading } = useMe();
  const [securityDialogOpen, setSecurityDialogOpen] = useState(false);
  const [endpointDialogOpen, setEndpointDialogOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<EndpointView | null>(
    null,
  );
  const [testingEndpoint, setTestingEndpoint] = useState<EndpointView | null>(
    null,
  );
  const [deletingEndpoint, setDeletingEndpoint] = useState<EndpointView | null>(
    null,
  );
  const [busyEndpointIds, setBusyEndpointIds] = useState<Set<string>>(
    new Set(),
  );
  const {
    data: endpoints,
    error: endpointsError,
    isLoading: endpointsLoading,
    mutate: mutateEndpoints,
  } = useSWR<EndpointView[]>("/api/tob/notification-endpoints", swrFetcher);

  const initials = (me?.user.displayName || me?.user.email || "?")
    .slice(0, 2)
    .toUpperCase();

  const toggleEndpoint = async (endpoint: EndpointView, enabled: boolean) => {
    setBusyEndpointIds((current) => new Set(current).add(endpoint.id));
    try {
      await api.patch(`/api/tob/notification-endpoints/${endpoint.id}`, {
        enabled,
      });
      void mutateEndpoints();
    } catch (error) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : t.notifChannels.actionFailed,
      );
    } finally {
      setBusyEndpointIds((current) => {
        const next = new Set(current);
        next.delete(endpoint.id);
        return next;
      });
    }
  };

  const deleteEndpoint = async () => {
    if (!deletingEndpoint) return;
    try {
      await api.delete(
        `/api/tob/notification-endpoints/${deletingEndpoint.id}`,
      );
      toast.success(t.notifChannels.endpointDeleted);
      void mutateEndpoints();
    } catch (error) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : t.notifChannels.actionFailed,
      );
    } finally {
      setDeletingEndpoint(null);
    }
  };

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold">{t.account.title}</h1>
          <p className="text-sm text-muted-foreground">{t.account.subtitle}</p>
        </div>

        {/* Profile summary */}
        <Card>
          <CardContent className="flex items-center gap-4">
            {isLoading ? (
              <>
                <Skeleton className="size-12 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-44" />
                </div>
              </>
            ) : (
              <>
                <Avatar className="size-12">
                  <AvatarFallback className="text-sm">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {me?.user.displayName}
                    </p>
                    {me?.role && (
                      <Badge variant="secondary" className="text-[11px]">
                        {t.roles[me.role] ?? me.role}
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {me?.user.email}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 rounded-lg py-0">
          <CardContent className="flex items-center gap-3 px-4 py-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
              <KeyRound className="size-4 text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.account.securityTitle}</p>
              <p className="text-xs text-muted-foreground">
                {t.account.securitySummary}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSecurityDialogOpen(true)}
            >
              {t.account.manageSecurity}
            </Button>
          </CardContent>
        </Card>

        <Card className="gap-0 rounded-lg py-0">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 px-4 py-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <BellRing className="size-4 text-muted-foreground" />
              {t.notifChannels.personalTitle}
            </CardTitle>
            <Button
              size="sm"
              onClick={() => {
                setEditingEndpoint(null);
                setEndpointDialogOpen(true);
              }}
            >
              <Plus className="size-4" />
              {t.notifChannels.addEndpoint}
            </Button>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {endpointsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : endpointsError && !endpoints ? (
              <div className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 text-center">
                <p className="text-sm text-muted-foreground">
                  {t.notifChannels.endpointsLoadFailed}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void mutateEndpoints()}
                >
                  <RefreshCw className="size-4" />
                  {t.notifChannels.retry}
                </Button>
              </div>
            ) : (endpoints?.length ?? 0) === 0 ? (
              <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                {t.notifChannels.noEndpoints}
              </div>
            ) : (
              <div className="divide-y rounded-md border">
                {endpoints!.map((endpoint) => {
                  const Icon = CHANNEL_ICONS[endpoint.channelType];
                  return (
                    <div
                      key={endpoint.id}
                      className="flex items-center gap-3 px-3 py-2.5"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Icon className="size-4 text-muted-foreground" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {endpoint.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t.notifChannels.types[endpoint.channelType]}
                        </p>
                      </div>
                      <Switch
                        checked={endpoint.enabled ?? false}
                        disabled={busyEndpointIds.has(endpoint.id)}
                        onCheckedChange={(checked) =>
                          void toggleEndpoint(endpoint, checked)
                        }
                        aria-label={t.notifChannels.enabled}
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => {
                              setEditingEndpoint(endpoint);
                              setEndpointDialogOpen(true);
                            }}
                            aria-label={t.common.edit}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t.common.edit}</TooltipContent>
                      </Tooltip>
                      <DropdownMenu>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                aria-label={t.notifChannels.moreActions}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                          </TooltipTrigger>
                          <TooltipContent>
                            {t.notifChannels.moreActions}
                          </TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => setTestingEndpoint(endpoint)}
                          >
                            <TestTube2 className="size-4" />
                            {t.notifChannels.testEndpoint}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setDeletingEndpoint(endpoint)}
                          >
                            <Trash2 className="size-4" />
                            {t.common.delete}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <SecuritySettingsDialog
          open={securityDialogOpen}
          onOpenChange={setSecurityDialogOpen}
        />
        <EndpointDialog
          endpoint={editingEndpoint}
          defaultEmail={me?.user.email}
          open={endpointDialogOpen}
          onOpenChange={setEndpointDialogOpen}
          onSaved={() => void mutateEndpoints()}
        />

        <EndpointTestDialog
          endpoint={testingEndpoint}
          open={Boolean(testingEndpoint)}
          onOpenChange={(open) => !open && setTestingEndpoint(null)}
        />

        <AlertDialog
          open={Boolean(deletingEndpoint)}
          onOpenChange={(open) => !open && setDeletingEndpoint(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t.notifChannels.deleteEndpointTitle}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t.notifChannels.deleteEndpointMessage.replace(
                  "{{name}}",
                  deletingEndpoint?.name ?? "",
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={deleteEndpoint}
              >
                {t.common.delete}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
