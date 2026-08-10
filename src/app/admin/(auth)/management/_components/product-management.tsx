"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Pencil, Plus, Settings, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { api, swrFetcher } from "@/lib/api/client";
import { useMe } from "@/lib/hooks/use-me";
import type { ProductView } from "@/lib/api/types";
import {
  type ProductFormValues,
  type ProductSlaField,
  validateProductForm,
} from "@/lib/product-form-validation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
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
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import {
  EmptyState,
  ErrorState,
  FormField,
  ManagerPanel,
  RowActions,
  TableSkeleton,
  errorMessage,
} from "./manager-ui";

interface Tenant {
  id: string;
  name: string;
}

const DEFAULT_TENANT = "__default__";

const emptyForm = (): ProductFormValues => ({
  name: "",
  tenantId: "",
  homepageUrl: "",
  portalReturnUrl: "",
  identityEnabled: false,
  identityEndpointUrl: "",
  identityAuthSecret: "",
  identitySecretConfigured: false,
  slaHighAccept: "",
  slaHighReply: "",
  slaMediumAccept: "",
  slaMediumReply: "",
  slaLowAccept: "",
  slaLowReply: "",
  autoCloseMinutes: "",
});

export function ProductManagement() {
  const router = useRouter();
  const { t } = useI18n();
  const m = t.management;
  const { can } = useMe();
  const isSuperAdmin = can("tenant.manage");
  const canManageProducts = can("product.manage");

  const {
    data: products,
    error,
    isLoading,
    mutate,
  } = useSWR<ProductView[]>("/api/tob/admin/products", swrFetcher);
  const { data: tenants } = useSWR<Tenant[]>(
    isSuperAdmin ? "/api/tob/admin/tenants" : null,
    swrFetcher
  );

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductView | null>(null);
  const [deleting, setDeleting] = useState<ProductView | null>(null);
  const [form, setForm] = useState<ProductFormValues>(emptyForm());
  const [formErrors, setFormErrors] = useState<
    Partial<Record<keyof ProductFormValues, string>>
  >({});
  const [pending, setPending] = useState(false);

  const tenantNames = useMemo(
    () => new Map((tenants ?? []).map((tenant) => [tenant.id, tenant.name])),
    [tenants]
  );

  const filtered = useMemo(() => {
    const list = products ?? [];
    const q = search.trim().toLowerCase();
    return q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
  }, [products, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = (product: ProductView) => {
    setEditing(product);
    setForm({
      name: product.name,
      tenantId: product.tenantId,
      homepageUrl: product.homepageUrl ?? "",
      portalReturnUrl: product.portalReturnUrl ?? "",
      identityEnabled: product.identityEnabled,
      identityEndpointUrl: product.identityEndpointUrl ?? "",
      identityAuthSecret: "",
      identitySecretConfigured: product.identitySecretConfigured,
      slaHighAccept: product.slaHighAccept?.toString() ?? "",
      slaHighReply: product.slaHighReply?.toString() ?? "",
      slaMediumAccept: product.slaMediumAccept?.toString() ?? "",
      slaMediumReply: product.slaMediumReply?.toString() ?? "",
      slaLowAccept: product.slaLowAccept?.toString() ?? "",
      slaLowReply: product.slaLowReply?.toString() ?? "",
      autoCloseMinutes: product.autoCloseMinutes?.toString() ?? "",
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const { errors, payload } = validateProductForm(form, {
      editing: editing !== null,
      includeTenant: isSuperAdmin,
      messages: {
        nameRequired: m.products.nameRequired,
        urlInvalid: m.products.urlInvalid,
        identityUrlInvalid: m.products.identityUrlInvalid,
        identitySecretRequired: m.products.identitySecretRequired,
        invalidNumber: m.invalidNumber,
      },
    });
    setFormErrors(errors);
    if (!payload) return;

    setPending(true);
    try {
      if (editing) {
        await api.patch(`/api/tob/admin/products/${editing.id}`, payload);
        toast.success(m.toastUpdated);
      } else {
        await api.post("/api/tob/admin/products", payload);
        toast.success(m.toastCreated);
      }
      setDialogOpen(false);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, m.loadFailed));
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await api.delete(`/api/tob/admin/products/${deleting.id}`);
      toast.success(m.toastDeleted);
      setDeleting(null);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, m.loadFailed));
      throw err;
    }
  };

  const slaSummary = (product: ProductView): string | null => {
    const parts: string[] = [];
    const row = (label: string, accept: number | null, reply: number | null) => {
      if (accept == null && reply == null) return;
      parts.push(`${label} ${accept ?? "-"}/${reply ?? "-"}`);
    };
    row(t.tickets.priority.high, product.slaHighAccept, product.slaHighReply);
    row(t.tickets.priority.medium, product.slaMediumAccept, product.slaMediumReply);
    row(t.tickets.priority.low, product.slaLowAccept, product.slaLowReply);
    return parts.length > 0 ? parts.join(" · ") : null;
  };

  const slaRow = (
    label: string,
    acceptField: ProductSlaField,
    replyField: ProductSlaField
  ) => (
    <div className="grid grid-cols-[72px_1fr_1fr] items-center gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div>
        <Input
          type="number"
          min={1}
          value={form[acceptField]}
          onChange={(e) =>
            setForm((f) => ({ ...f, [acceptField]: e.target.value }))
          }
          className="h-8"
        />
        {formErrors[acceptField] && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            {formErrors[acceptField]}
          </p>
        )}
      </div>
      <div>
        <Input
          type="number"
          min={1}
          value={form[replyField]}
          onChange={(e) =>
            setForm((f) => ({ ...f, [replyField]: e.target.value }))
          }
          className="h-8"
        />
        {formErrors[replyField] && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            {formErrors[replyField]}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <>
      <ManagerPanel
        title={m.tabs.products}
        description={m.products.description}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={t.common.search}
        actions={canManageProducts ? (
          <Button size="sm" className="h-8" onClick={openCreate}>
            <Plus className="mr-1.5 size-3.5" />
            {m.products.create}
          </Button>
        ) : null}
      >
        {isLoading ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState onRetry={() => void mutate()} />
        ) : filtered.length === 0 ? (
          <EmptyState message={m.noData.replace("{{type}}", m.tabs.products)} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.products.name}</TableHead>
                {isSuperAdmin && <TableHead>{m.products.tenant}</TableHead>}
                <TableHead>{m.products.slaPolicy}</TableHead>
                <TableHead>{m.products.autoClose}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((product) => {
                const summary = slaSummary(product);
                return (
                  <TableRow key={product.id}>
                    <TableCell className="text-sm font-medium">
                      {product.name}
                    </TableCell>
                    {isSuperAdmin && (
                      <TableCell className="text-sm text-muted-foreground">
                        {tenantNames.get(product.tenantId) ?? product.tenantId}
                      </TableCell>
                    )}
                    <TableCell>
                      {summary ? (
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {summary}
                        </span>
                      ) : (
                        <Badge variant="secondary">{m.products.slaNone}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {product.autoCloseMinutes != null ? (
                        <span className="text-sm tabular-nums">
                          {product.autoCloseMinutes}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {m.products.autoCloseOff}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        actions={[
                          {
                            label: m.manage,
                            icon: Settings,
                            onSelect: () => router.push(`/admin/management/products/${product.id}`),
                          },
                          {
                            label: t.common.edit,
                            icon: Pencil,
                            onSelect: () => openEdit(product),
                          },
                          ...(canManageProducts ? [{
                            label: t.common.delete,
                            icon: Trash2,
                            destructive: true,
                            separatorBefore: true,
                            onSelect: () => setDeleting(product),
                          }] : []),
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </ManagerPanel>

      <Dialog open={dialogOpen} onOpenChange={(open) => !pending && setDialogOpen(open)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? m.products.edit : m.products.create}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[65vh] space-y-4 overflow-y-auto py-2 pr-1">
            <FormField
              label={m.products.name}
              htmlFor="product-name"
              required
              error={formErrors.name}
            >
              <Input
                id="product-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={m.products.namePlaceholder}
                className="h-8"
              />
            </FormField>

            {isSuperAdmin && !editing && (
              <FormField label={m.products.tenant}>
                <Select
                  value={form.tenantId || DEFAULT_TENANT}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      tenantId: v === DEFAULT_TENANT ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder={m.products.selectTenant} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_TENANT}>
                      {m.products.defaultTenant}
                    </SelectItem>
                    {(tenants ?? []).map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label={m.products.homepageUrl}
                htmlFor="product-homepage-url"
                hint={m.products.homepageUrlHint}
                error={formErrors.homepageUrl}
              >
                <Input
                  id="product-homepage-url"
                  type="url"
                  value={form.homepageUrl}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, homepageUrl: e.target.value }))
                  }
                  placeholder={m.products.homepageUrlPlaceholder}
                  className="h-8"
                />
              </FormField>
              <FormField
                label={m.products.portalReturnUrl}
                htmlFor="product-portal-return-url"
                hint={m.products.portalReturnUrlHint}
                error={formErrors.portalReturnUrl}
              >
                <Input
                  id="product-portal-return-url"
                  type="url"
                  value={form.portalReturnUrl}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, portalReturnUrl: e.target.value }))
                  }
                  placeholder={m.products.portalReturnUrlPlaceholder}
                  className="h-8"
                />
              </FormField>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="product-identity-enabled"
                  checked={form.identityEnabled}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      identityEnabled: checked === true,
                    }))
                  }
                />
                <div className="space-y-0.5">
                  <Label htmlFor="product-identity-enabled">
                    {m.products.identityTitle}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {m.products.identityHint}
                  </p>
                </div>
              </div>

              <FormField
                label={m.products.identityEndpoint}
                htmlFor="product-identity-endpoint"
                hint={m.products.identityEndpointHint}
                error={formErrors.identityEndpointUrl}
              >
                <Input
                  id="product-identity-endpoint"
                  type="url"
                  value={form.identityEndpointUrl}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      identityEndpointUrl: event.target.value,
                    }))
                  }
                  placeholder="https://api.example.com/onfire/userinfo"
                  className="h-8"
                  disabled={!form.identityEnabled}
                />
              </FormField>

              <FormField
                label={m.products.identitySecret}
                htmlFor="product-identity-secret"
                hint={
                  form.identitySecretConfigured
                    ? m.products.identitySecretConfigured
                    : m.products.identitySecretHint
                }
                error={formErrors.identityAuthSecret}
              >
                <Input
                  id="product-identity-secret"
                  type="password"
                  autoComplete="new-password"
                  value={form.identityAuthSecret}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      identityAuthSecret: event.target.value,
                    }))
                  }
                  placeholder={m.products.identitySecretPlaceholder}
                  className="h-8"
                  disabled={!form.identityEnabled}
                />
              </FormField>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-sm">{m.products.slaPolicy}</Label>
              <p className="text-xs text-muted-foreground">{m.products.slaHint}</p>
              <div className="grid grid-cols-[72px_1fr_1fr] gap-2">
                <span />
                <span className="text-xs font-medium text-muted-foreground">
                  {m.products.accept}
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  {m.products.reply}
                </span>
              </div>
              {slaRow(t.tickets.priority.high, "slaHighAccept", "slaHighReply")}
              {slaRow(t.tickets.priority.medium, "slaMediumAccept", "slaMediumReply")}
              {slaRow(t.tickets.priority.low, "slaLowAccept", "slaLowReply")}
            </div>

            <Separator />

            <FormField
              label={m.products.autoClose}
              htmlFor="product-autoclose"
              hint={m.products.autoCloseHint}
              error={formErrors.autoCloseMinutes}
            >
              <Input
                id="product-autoclose"
                type="number"
                min={1}
                value={form.autoCloseMinutes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, autoCloseMinutes: e.target.value }))
                }
                className="h-8"
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setDialogOpen(false)}
              disabled={pending}
            >
              {t.common.cancel}
            </Button>
            <Button size="sm" className="h-8" onClick={handleSubmit} disabled={pending}>
              {pending ? t.common.loading : t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        itemName={deleting?.name || ""}
        onConfirm={handleDelete}
      />
    </>
  );
}
