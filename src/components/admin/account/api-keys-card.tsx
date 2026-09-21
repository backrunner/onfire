"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Ban, Copy, KeyRound, Pencil, Plus } from "lucide-react";
import { api, ApiClientError, swrFetcher } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { defaultKeyExpiry, localKeyExpiry } from "@/lib/api-keys/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface KeyView {
  id: string;
  name: string;
  permissions: string[];
  resourceMode: "all" | "products";
  productIds: string[];
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}
interface Options {
  keys: KeyView[];
  operations: {
    id: string;
    method: string;
    path: string;
    productScoped: boolean;
  }[];
  products: { id: string; name: string }[];
}
interface Draft {
  name: string;
  expiresAt: string;
  permissions: string[];
  resourceMode: "all" | "products";
  productIds: string[];
}
const endpoint = "/api/tob/api-keys";
const toggle = (values: string[], value: string, checked: boolean) =>
  checked
    ? [...new Set([...values, value])]
    : values.filter((item) => item !== value);

export function ApiKeysCard() {
  const { t } = useI18n();
  const m = t.accountApiKeys;
  const { data, error, isLoading, mutate } = useSWR<Options>(
    endpoint,
    swrFetcher,
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<KeyView | null>(null);
  const [revoking, setRevoking] = useState<KeyView | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [search, setSearch] = useState("");
  const operations = (data?.operations ?? []).filter(
    (op) => draft?.resourceMode !== "products" || op.productScoped,
  );
  const label = (id: string) =>
    (m.operations as Record<string, string>)[id] ?? id.replaceAll("_", " ");

  function open(key?: KeyView) {
    setEditing(key ?? null);
    setFeedback("");
    setSearch("");
    setDraft(
      key
        ? {
            name: key.name,
            expiresAt: localKeyExpiry(key.expiresAt),
            permissions: [...key.permissions],
            resourceMode: key.resourceMode,
            productIds: [...key.productIds],
          }
        : {
            name: "",
            expiresAt: defaultKeyExpiry(),
            permissions: [],
            resourceMode: "all",
            productIds: [],
          },
    );
  }
  async function save() {
    if (!draft) return;
    const expiry = new Date(draft.expiresAt).getTime();
    if (
      !draft.name.trim() ||
      !draft.permissions.length ||
      !Number.isFinite(expiry) ||
      expiry <= Date.now() ||
      expiry > Date.now() + 365 * 86400000 ||
      (draft.resourceMode === "products" && !draft.productIds.length)
    ) {
      setFeedback(m.validation);
      return;
    }
    if (editing && expiry > Date.parse(editing.expiresAt)) {
      setFeedback(m.noExtension);
      return;
    }
    setPending(true);
    setFeedback("");
    try {
      const body = {
        ...draft,
        name: draft.name.trim(),
        expiresAt: new Date(expiry).toISOString(),
      };
      if (editing) await api.patch(`${endpoint}/${editing.id}`, body);
      else {
        const result = await api.post<{ apiKey: string }>(endpoint, body);
        setSecret(result.apiKey);
      }
      setDraft(null);
      await mutate();
    } catch (error) {
      setFeedback(error instanceof ApiClientError ? error.message : m.failed);
    } finally {
      setPending(false);
    }
  }
  async function revoke() {
    if (!revoking) return;
    setPending(true);
    try {
      await api.delete(`${endpoint}/${revoking.id}`);
      setRevoking(null);
      await mutate();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : m.failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Card className="gap-0 rounded-lg py-0">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 px-4 py-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-muted-foreground" />
            {m.title}
          </CardTitle>
          <Button size="sm" onClick={() => open()} disabled={!data}>
            <Plus className="size-4" />
            {m.create}
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t.common.loading}
            </p>
          ) : error ? (
            <div className="py-4 text-center">
              <p className="mb-2 text-sm">{m.loadFailed}</p>
              <Button variant="outline" size="sm" onClick={() => void mutate()}>
                {t.common.refresh}
              </Button>
            </div>
          ) : !data?.keys.length ? (
            <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
              {m.empty}
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {data.keys.map((key) => {
                const expired = Date.parse(key.expiresAt) <= Date.now();
                return (
                  <div
                    key={key.id}
                    className="flex items-start gap-2 px-3 py-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="break-all text-sm font-medium">
                          {key.name}
                        </span>
                        <Badge variant="secondary">
                          {key.revokedAt
                            ? m.revoked
                            : expired
                              ? m.expired
                              : m.active}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {key.resourceMode === "all"
                          ? m.allResources
                          : m.selectedProducts}{" "}
                        · {key.permissions.length} {m.permissions}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.expiresAt}:{" "}
                        {new Date(key.expiresAt).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {m.lastUsed}:{" "}
                        {key.lastUsedAt
                          ? new Date(key.lastUsedAt).toLocaleString()
                          : m.never}
                      </p>
                    </div>
                    <div className="flex shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        disabled={Boolean(key.revokedAt) || expired}
                        aria-label={`${t.common.edit} ${key.name}`}
                        onClick={() => open(key)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive"
                        disabled={Boolean(key.revokedAt)}
                        aria-label={`${m.revoke} ${key.name}`}
                        onClick={() => setRevoking(key)}
                      >
                        <Ban className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={Boolean(draft)}
        onOpenChange={(open) => !open && !pending && setDraft(null)}
      >
        <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 p-4">
            <DialogTitle>{editing ? m.edit : m.create}</DialogTitle>
            <DialogDescription>{m.description}</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="min-h-0 space-y-4 overflow-y-auto px-4 pb-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="account-key-name">{m.name}</Label>
                  <Input
                    id="account-key-name"
                    maxLength={100}
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account-key-expiry">{m.expiresAt}</Label>
                  <Input
                    id="account-key-expiry"
                    type="datetime-local"
                    value={draft.expiresAt}
                    max={localKeyExpiry(
                      editing?.expiresAt ??
                        new Date(Date.now() + 365 * 86400000).toISOString(),
                    )}
                    onChange={(e) =>
                      setDraft({ ...draft, expiresAt: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{m.resources}</Label>
                <Select
                  value={draft.resourceMode}
                  onValueChange={(value: "all" | "products") =>
                    setDraft({
                      ...draft,
                      resourceMode: value,
                      productIds: [],
                      permissions: draft.permissions.filter((id) =>
                        data?.operations.some(
                          (op) =>
                            op.id === id &&
                            (value === "all" || op.productScoped),
                        ),
                      ),
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{m.allResources}</SelectItem>
                    <SelectItem value="products">
                      {m.selectedProducts}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {draft.resourceMode === "products" && (
                <div className="max-h-36 space-y-2 overflow-auto rounded-md border p-3">
                  {!data?.products.length && (
                    <p className="text-sm text-muted-foreground">
                      {m.noProducts}
                    </p>
                  )}
                  {data?.products.map((product) => (
                    <label
                      key={product.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={draft.productIds.includes(product.id)}
                        onCheckedChange={(checked) =>
                          setDraft({
                            ...draft,
                            productIds: toggle(
                              draft.productIds,
                              product.id,
                              checked === true,
                            ),
                          })
                        }
                      />
                      <span className="break-all">{product.name}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>
                    {m.permissions} ({draft.permissions.length})
                  </Label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          permissions: operations
                            .filter((op) => op.method === "GET")
                            .map((op) => op.id),
                        })
                      }
                    >
                      {m.readOnly}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          permissions: operations.map((op) => op.id),
                        })
                      }
                    >
                      {m.selectAll}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setDraft({ ...draft, permissions: [] })}
                    >
                      {m.clear}
                    </Button>
                  </div>
                </div>
                <Input
                  aria-label={m.search}
                  placeholder={m.search}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="divide-y rounded-md border">
                  {operations
                    .filter((op) =>
                      `${label(op.id)} ${op.id} ${op.path}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((op) => (
                      <label
                        key={op.id}
                        className="flex items-start gap-2 px-3 py-2"
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={draft.permissions.includes(op.id)}
                          onCheckedChange={(checked) =>
                            setDraft({
                              ...draft,
                              permissions: toggle(
                                draft.permissions,
                                op.id,
                                checked === true,
                              ),
                            })
                          }
                        />
                        <span className="min-w-0">
                          <span className="block text-sm">{label(op.id)}</span>
                          <span className="block break-all font-mono text-[11px] text-muted-foreground">
                            {op.method} {op.path}
                          </span>
                        </span>
                      </label>
                    ))}
                </div>
              </div>
              {draft.permissions.some((id) =>
                operations.some((op) => op.id === id && op.method !== "GET"),
              ) && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {m.writeWarning}
                </p>
              )}
              {feedback && (
                <p role="alert" className="text-sm text-destructive">
                  {feedback}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="shrink-0 border-t p-4">
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setDraft(null)}
            >
              {t.common.cancel}
            </Button>
            <Button disabled={pending} onClick={() => void save()}>
              {pending ? t.common.loading : t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(secret)}
        onOpenChange={(open) => !open && setSecret(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.secretTitle}</DialogTitle>
            <DialogDescription>{m.secretWarning}</DialogDescription>
          </DialogHeader>
          <Input
            aria-label={m.title}
            value={secret ?? ""}
            readOnly
            className="font-mono text-xs"
            onFocus={(e) => e.target.select()}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(secret ?? "").then(
                  () => toast.success(m.copied),
                  () => toast.error(m.failed),
                );
              }}
            >
              <Copy className="size-4" />
              {t.common.copy}
            </Button>
            <Button onClick={() => setSecret(null)}>{t.common.close}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={Boolean(revoking)}
        onOpenChange={(open) => !open && !pending && setRevoking(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.revoke}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.revokeConfirm.replace("{{name}}", revoking?.name ?? "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t.common.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                void revoke();
              }}
            >
              {pending ? t.common.loading : m.revoke}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
