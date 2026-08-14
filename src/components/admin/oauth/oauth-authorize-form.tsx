"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  AppWindow,
  Boxes,
  Building2,
  Check,
  Flame,
  Loader2,
  LockKeyhole,
  MonitorCheck,
  Package,
  ShieldAlert,
} from "lucide-react";
import { api, ApiClientError, swrFetcher } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import type { McpPermission } from "@/lib/mcp/permissions";
import { LanguageToggle } from "@/components/admin/shell/language-toggle";
import { ThemeToggle } from "@/components/admin/shell/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

interface OAuthAuthorizationContext {
  client: { id: string; name: string | null; uri: string | null };
  callback: { host: string; isLoopback: boolean };
  requestedScopes: string[];
  availablePermissions: McpPermission[];
  defaultPermissions: McpPermission[];
  defaultResourceMode: "all" | "selected";
  defaultTenantIds: string[];
  defaultProductIds: string[];
  tenants: Array<{ id: string; name: string }>;
  products: Array<{ id: string; tenantId: string; name: string }>;
}

interface OAuthAuthorizeFormProps {
  oauthQuery: string;
}

export function OAuthAuthorizeForm({ oauthQuery }: OAuthAuthorizeFormProps) {
  const { t } = useI18n();
  const endpoint = oauthQuery
    ? `/api/tob/oauth/authorize?oauth_query=${encodeURIComponent(oauthQuery)}`
    : null;
  const { data, error, isLoading, mutate } = useSWR<OAuthAuthorizationContext>(
    endpoint,
    swrFetcher,
    { shouldRetryOnError: false },
  );

  useEffect(() => {
    if (error instanceof ApiClientError && error.status === 401) {
      window.location.assign(`/admin/login?${oauthQuery}`);
    }
  }, [error, oauthQuery]);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background/95">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Flame className="size-4" />
            </span>
            OnFire
          </div>
          <div className="flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl justify-center px-4 py-8 sm:px-6 sm:py-12">
        {isLoading ? (
          <AuthorizationSkeleton />
        ) : error || !data ? (
          <Card className="w-full max-w-2xl">
            <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
              <ShieldAlert className="size-8 text-destructive" />
              <div>
                <p className="text-sm font-medium">{t.oauth.loadFailed}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {error instanceof ApiClientError
                    ? error.message
                    : t.oauth.invalidRequest}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void mutate()}>
                {t.oauth.retry}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ConsentPanel data={data} oauthQuery={oauthQuery} />
        )}
      </main>
    </div>
  );
}

function ConsentPanel({
  data,
  oauthQuery,
}: {
  data: OAuthAuthorizationContext;
  oauthQuery: string;
}) {
  const { t } = useI18n();
  const [permissions, setPermissions] = useState<Set<McpPermission>>(
    () => new Set(data.defaultPermissions),
  );
  const [resourceMode, setResourceMode] = useState<"all" | "selected">(
    data.defaultResourceMode,
  );
  const [tenantIds, setTenantIds] = useState<Set<string>>(
    () => new Set(data.defaultTenantIds),
  );
  const [productIds, setProductIds] = useState<Set<string>>(
    () => new Set(data.defaultProductIds),
  );
  const [submitting, setSubmitting] = useState<"accept" | "deny" | null>(null);
  const [error, setError] = useState("");

  const groupedPermissions = useMemo(
    () => ({
      tickets: data.availablePermissions.filter((permission) =>
        permission.startsWith("tickets:"),
      ),
      settings: data.availablePermissions.filter((permission) =>
        permission.startsWith("settings:"),
      ),
    }),
    [data.availablePermissions],
  );
  const productsByTenant = useMemo(() => {
    const map = new Map<string, OAuthAuthorizationContext["products"]>();
    for (const product of data.products) {
      const rows = map.get(product.tenantId) ?? [];
      rows.push(product);
      map.set(product.tenantId, rows);
    }
    return map;
  }, [data.products]);
  const readOnlyPermissions = data.availablePermissions.filter(
    (permission) => permission.endsWith(":read"),
  );
  const fullAccess =
    permissions.size === data.availablePermissions.length &&
    data.availablePermissions.length > 0;
  const selectedResourceCount = tenantIds.size + productIds.size;
  const canAccept =
    permissions.size > 0 &&
    (resourceMode === "all" || selectedResourceCount > 0) &&
    submitting === null;
  const clientName = data.client.name || t.oauth.unnamedApplication;

  const setPreset = (preset: "read" | "full") => {
    setPermissions(
      new Set(
        preset === "read" ? readOnlyPermissions : data.availablePermissions,
      ),
    );
  };

  const togglePermission = (permission: McpPermission, checked: boolean) => {
    setPermissions((current) => {
      const next = new Set(current);
      if (checked) next.add(permission);
      else next.delete(permission);
      return next;
    });
  };

  const toggleTenant = (tenantId: string, checked: boolean) => {
    setTenantIds((current) => {
      const next = new Set(current);
      if (checked) next.add(tenantId);
      else next.delete(tenantId);
      return next;
    });
    if (checked) {
      const childIds = new Set(
        (productsByTenant.get(tenantId) ?? []).map((product) => product.id),
      );
      setProductIds(
        (current) => new Set([...current].filter((id) => !childIds.has(id))),
      );
    }
  };

  const toggleProduct = (productId: string, checked: boolean) => {
    setProductIds((current) => {
      const next = new Set(current);
      if (checked) next.add(productId);
      else next.delete(productId);
      return next;
    });
  };

  const submit = async (accept: boolean) => {
    setSubmitting(accept ? "accept" : "deny");
    setError("");
    try {
      const result = await api.post<{ redirectUrl: string }>(
        "/api/tob/oauth/authorize",
        {
          accept,
          oauthQuery,
          permissions: [...permissions],
          resourceMode,
          tenantIds: [...tenantIds],
          productIds: [...productIds],
        },
      );
      window.location.assign(result.redirectUrl);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : t.oauth.submitFailed,
      );
      setSubmitting(null);
    }
  };

  return (
    <Card className="w-full max-w-2xl gap-0 overflow-hidden py-0 shadow-sm">
      <CardHeader className="px-5 py-6 sm:px-7">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-muted">
            <AppWindow className="size-5 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-6">
              {t.oauth.requestTitle.replace("{{client}}", clientName)}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.oauth.requestSubtitle}
            </p>
            {data.client.uri && (
              <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
                {data.client.uri}
              </p>
            )}
            <div className="mt-3 flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <MonitorCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {t.oauth.callbackHost}
                </p>
                <p className="truncate font-mono text-xs font-medium">
                  {data.callback.host}
                </p>
                {data.callback.isLoopback && (
                  <p className="mt-1 text-xs leading-4 text-amber-700 dark:text-amber-300">
                    {t.oauth.loopbackCallbackWarning}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="space-y-6 px-5 py-6 sm:px-7">
        <section aria-labelledby="oauth-permissions-title" className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="oauth-permissions-title" className="text-sm font-medium">
                {t.oauth.permissionsTitle}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t.oauth.permissionsHint}
              </p>
            </div>
            <div className="flex rounded-md border p-0.5">
              <Button
                type="button"
                variant={
                  permissions.size === readOnlyPermissions.length &&
                  readOnlyPermissions.every((permission) =>
                    permissions.has(permission),
                  )
                    ? "secondary"
                    : "ghost"
                }
                size="sm"
                className="h-7 rounded-sm px-2.5 text-xs"
                onClick={() => setPreset("read")}
              >
                {t.oauth.readOnlyPreset}
              </Button>
              <Button
                type="button"
                variant={fullAccess ? "secondary" : "ghost"}
                size="sm"
                className="h-7 rounded-sm px-2.5 text-xs"
                onClick={() => setPreset("full")}
              >
                {t.oauth.fullAccessPreset}
              </Button>
            </div>
          </div>

          <div className="divide-y rounded-md border">
            {(["tickets", "settings"] as const).map((group) => {
              const groupPermissions = groupedPermissions[group];
              if (groupPermissions.length === 0) return null;
              const Icon = group === "tickets" ? Boxes : LockKeyhole;
              return (
                <div key={group} className="px-3 py-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      {t.oauth.permissionGroups[group]}
                    </p>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {groupPermissions.map((permission) => {
                      const copy = t.oauth.permissions[permission];
                      return (
                        <label
                          key={permission}
                          className="flex min-h-14 cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/60"
                        >
                          <Checkbox
                            className="mt-0.5"
                            checked={permissions.has(permission)}
                            onCheckedChange={(checked) =>
                              togglePermission(permission, checked === true)
                            }
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">
                              {copy.label}
                            </span>
                            <span className="block text-xs leading-4 text-muted-foreground">
                              {copy.description}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {fullAccess && (
            <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-950 dark:text-amber-100">
              <ShieldAlert />
              <AlertTitle>{t.oauth.fullAccessWarningTitle}</AlertTitle>
              <AlertDescription>
                {t.oauth.fullAccessWarningDescription}
              </AlertDescription>
            </Alert>
          )}
        </section>

        <Separator />

        <section aria-labelledby="oauth-resources-title" className="space-y-4">
          <div>
            <h2 id="oauth-resources-title" className="text-sm font-medium">
              {t.oauth.resourcesTitle}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t.oauth.resourcesHint}
            </p>
          </div>
          <RadioGroup
            value={resourceMode}
            onValueChange={(value) =>
              setResourceMode(value as "all" | "selected")
            }
            className="gap-2"
          >
            <Label
              htmlFor="oauth-resources-all"
              className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3"
            >
              <RadioGroupItem id="oauth-resources-all" value="all" className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {t.oauth.allResources}
                  <Badge variant="secondary" className="text-[10px]">
                    {data.tenants.length + data.products.length}
                  </Badge>
                </span>
                <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                  {t.oauth.allResourcesDescription}
                </span>
              </span>
            </Label>
            <Label
              htmlFor="oauth-resources-selected"
              className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3"
            >
              <RadioGroupItem
                id="oauth-resources-selected"
                value="selected"
                className="mt-0.5"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {t.oauth.selectedResources}
                  {resourceMode === "selected" && (
                    <Badge variant="secondary" className="text-[10px]">
                      {selectedResourceCount}
                    </Badge>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                  {t.oauth.selectedResourcesDescription}
                </span>
              </span>
            </Label>
          </RadioGroup>

          {resourceMode === "selected" && (
            <div className="max-h-72 overflow-y-auto rounded-md border">
              {data.tenants.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  {t.oauth.noResources}
                </p>
              ) : (
                data.tenants.map((tenant) => {
                  const tenantProducts = productsByTenant.get(tenant.id) ?? [];
                  const tenantSelected = tenantIds.has(tenant.id);
                  return (
                    <div key={tenant.id} className="border-b last:border-b-0">
                      <label className="flex cursor-pointer items-center gap-3 bg-muted/40 px-3 py-2.5">
                        <Checkbox
                          checked={tenantSelected}
                          onCheckedChange={(checked) =>
                            toggleTenant(tenant.id, checked === true)
                          }
                        />
                        <Building2 className="size-4 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {tenant.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t.oauth.productCount.replace(
                            "{{count}}",
                            String(tenantProducts.length),
                          )}
                        </span>
                      </label>
                      {tenantProducts.length > 0 && (
                        <div className="divide-y pl-7">
                          {tenantProducts.map((product) => (
                            <label
                              key={product.id}
                              className="flex cursor-pointer items-center gap-3 px-3 py-2.5"
                            >
                              <Checkbox
                                checked={
                                  tenantSelected || productIds.has(product.id)
                                }
                                disabled={tenantSelected}
                                onCheckedChange={(checked) =>
                                  toggleProduct(product.id, checked === true)
                                }
                              />
                              <Package className="size-4 text-muted-foreground" />
                              <span className="truncate text-sm">{product.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>

      <Separator />

      <div className="sticky bottom-0 flex flex-col-reverse gap-2 bg-background px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
        <Button
          type="button"
          variant="outline"
          disabled={submitting !== null}
          onClick={() => void submit(false)}
        >
          {submitting === "deny" && <Loader2 className="size-4 animate-spin" />}
          {t.oauth.deny}
        </Button>
        <Button
          type="button"
          disabled={!canAccept}
          onClick={() => void submit(true)}
        >
          {submitting === "accept" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          {t.oauth.allow}
        </Button>
      </div>
    </Card>
  );
}

function AuthorizationSkeleton() {
  return (
    <Card className="w-full max-w-2xl gap-0 overflow-hidden py-0">
      <CardContent className="space-y-6 px-5 py-6 sm:px-7">
        <div className="flex gap-4">
          <Skeleton className="size-11 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </CardContent>
    </Card>
  );
}
