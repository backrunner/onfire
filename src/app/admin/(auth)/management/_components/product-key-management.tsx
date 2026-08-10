"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Ban, Copy, Pencil, Plus, RefreshCw, Trash2, Undo2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api, qs, swrFetcher } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import {
  EmptyState,
  ErrorState,
  FormField,
  ManagerPanel,
  RowActions,
  TableSkeleton,
  errorMessage,
  formatDateTime,
} from "./manager-ui";

interface Product {
  id: string;
  name: string;
}

interface ProductKeyView {
  id: string;
  productId: string;
  name: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  revoked: boolean | null;
}

interface CreatedKeyResponse {
  id: string;
  productId: string;
  name?: string | null;
  apiKey: string;
  createdAt: string;
}

interface RotatedKeyResponse {
  id: string;
  apiKey: string;
  rotatedAt: string;
}

/** Plaintext secret shown exactly once after create/rotate. */
interface SecretReveal {
  title: string;
  apiKey: string;
}

const ALL = "all";

export function ProductKeyManagement({ productId }: { productId?: string }) {
  const { t } = useI18n();
  const m = t.management;

  const [productFilter, setProductFilter] = useState<string>(productId ?? ALL);

  const {
    data: keys,
    error,
    isLoading,
    mutate,
  } = useSWR<ProductKeyView[]>(
    `/api/tob/admin/product-keys${qs({
      productId: productFilter === ALL ? undefined : productFilter,
    })}`,
    swrFetcher
  );
  const { data: products } = useSWR<Product[]>(
    "/api/tob/meta/products",
    swrFetcher
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ productId: "", name: "" });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [secret, setSecret] = useState<SecretReveal | null>(null);
  const [rotating, setRotating] = useState<ProductKeyView | null>(null);
  const [rotatePending, setRotatePending] = useState(false);
  const [editing, setEditing] = useState<ProductKeyView | null>(null);
  const [editName, setEditName] = useState("");
  const [editPending, setEditPending] = useState(false);
  const [deleting, setDeleting] = useState<ProductKeyView | null>(null);

  const productNames = useMemo(
    () => new Map((products ?? []).map((product) => [product.id, product.name])),
    [products]
  );

  const keyLabel = (key: ProductKeyView) => key.name || key.id;

  const openCreate = () => {
    setForm({
      productId: productId ?? (productFilter === ALL ? "" : productFilter),
      name: "",
    });
    setFormErrors({});
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    const errors: Record<string, string> = {};
    if (!form.productId) errors.productId = m.apiKeys.selectProduct;
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    try {
      const created = await api.post<CreatedKeyResponse>(
        "/api/tob/admin/product-keys",
        {
          productId: form.productId,
          ...(form.name.trim() ? { name: form.name.trim() } : {}),
        }
      );
      toast.success(m.toastCreated);
      setCreateOpen(false);
      setSecret({ title: m.apiKeys.secretTitle, apiKey: created.apiKey });
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, m.loadFailed));
    } finally {
      setPending(false);
    }
  };

  const handleRotate = async () => {
    if (!rotating) return;
    setRotatePending(true);
    try {
      const rotated = await api.post<RotatedKeyResponse>(
        `/api/tob/admin/product-keys/${rotating.id}/rotate`
      );
      setRotating(null);
      setSecret({ title: m.apiKeys.rotatedTitle, apiKey: rotated.apiKey });
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, m.loadFailed));
    } finally {
      setRotatePending(false);
    }
  };

  const handleSetRevoked = async (key: ProductKeyView, revoked: boolean) => {
    try {
      await api.patch(`/api/tob/admin/product-keys/${key.id}`, { revoked });
      toast.success(m.toastUpdated);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, m.loadFailed));
    }
  };

  const openEdit = (key: ProductKeyView) => {
    setEditing(key);
    setEditName(key.name ?? "");
  };

  const handleEdit = async () => {
    if (!editing) return;
    setEditPending(true);
    try {
      await api.patch(`/api/tob/admin/product-keys/${editing.id}`, {
        name: editName.trim(),
      });
      toast.success(m.toastUpdated);
      setEditing(null);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, m.loadFailed));
    } finally {
      setEditPending(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await api.delete(`/api/tob/admin/product-keys/${deleting.id}`);
      toast.success(m.toastDeleted);
      setDeleting(null);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, m.loadFailed));
      throw err;
    }
  };

  const handleCopySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret.apiKey);
      toast.success(m.toastCopied);
    } catch {
      toast.error(m.loadFailed);
    }
  };

  return (
    <>
      <ManagerPanel
        title={m.apiKeys.title}
        description={m.apiKeys.description}
        actions={
          <>
            {!productId && <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger className="h-8 w-44 text-sm">
                <SelectValue placeholder={m.apiKeys.allProducts} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{m.apiKeys.allProducts}</SelectItem>
                {(products ?? []).map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>}
            <Button
              size="sm"
              className="h-8"
              onClick={openCreate}
              disabled={(products?.length ?? 0) === 0}
            >
              <Plus className="mr-1.5 size-3.5" />
              {m.apiKeys.create}
            </Button>
          </>
        }
      >
        {isLoading ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState onRetry={() => void mutate()} />
        ) : !keys || keys.length === 0 ? (
          <EmptyState message={m.apiKeys.noKeys} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.apiKeys.name}</TableHead>
                {!productId && <TableHead>{m.apiKeys.product}</TableHead>}
                <TableHead>{m.apiKeys.createdAt}</TableHead>
                <TableHead>{m.apiKeys.lastUsed}</TableHead>
                <TableHead>{t.common.status}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => {
                const revoked = key.revoked === true;
                return (
                  <TableRow key={key.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{key.name || "-"}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {key.id}
                      </div>
                    </TableCell>
                    {!productId && <TableCell className="text-sm text-muted-foreground">
                      {productNames.get(key.productId) ?? key.productId}
                    </TableCell>}
                    <TableCell className="text-sm tabular-nums text-muted-foreground">
                      {formatDateTime(key.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">
                      {key.lastUsedAt
                        ? formatDateTime(key.lastUsedAt)
                        : m.apiKeys.neverUsed}
                    </TableCell>
                    <TableCell>
                      {revoked ? (
                        <Badge variant="destructive">{m.apiKeys.revoked}</Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        >
                          {m.apiKeys.active}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        actions={[
                          {
                            label: t.common.edit,
                            icon: Pencil,
                            onSelect: () => openEdit(key),
                          },
                          {
                            label: m.apiKeys.rotate,
                            icon: RefreshCw,
                            disabled: revoked,
                            onSelect: () => setRotating(key),
                          },
                          revoked
                            ? {
                                label: m.apiKeys.unrevoke,
                                icon: Undo2,
                                onSelect: () => void handleSetRevoked(key, false),
                              }
                            : {
                                label: m.apiKeys.revoke,
                                icon: Ban,
                                destructive: true,
                                onSelect: () => void handleSetRevoked(key, true),
                              },
                          {
                            label: t.common.delete,
                            icon: Trash2,
                            destructive: true,
                            separatorBefore: true,
                            onSelect: () => setDeleting(key),
                          },
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

      <Dialog open={createOpen} onOpenChange={(open) => !pending && setCreateOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{m.apiKeys.create}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!productId && <FormField
              label={m.apiKeys.product}
              required
              error={formErrors.productId}
            >
              <Select
                value={form.productId}
                onValueChange={(v) => setForm((f) => ({ ...f, productId: v }))}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder={m.apiKeys.selectProduct} />
                </SelectTrigger>
                <SelectContent>
                  {(products ?? []).map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>}

            <FormField label={m.apiKeys.name} htmlFor="key-name">
              <Input
                id="key-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={m.apiKeys.namePlaceholder}
                maxLength={100}
                className="h-8"
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setCreateOpen(false)}
              disabled={pending}
            >
              {t.common.cancel}
            </Button>
            <Button size="sm" className="h-8" onClick={handleCreate} disabled={pending}>
              {pending ? t.common.loading : t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editing}
        onOpenChange={(open) => !editPending && !open && setEditing(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{m.apiKeys.edit}</DialogTitle>
          </DialogHeader>
          <FormField label={m.apiKeys.name} htmlFor="edit-key-name">
            <Input
              id="edit-key-name"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              placeholder={m.apiKeys.namePlaceholder}
              maxLength={100}
              className="h-8"
            />
          </FormField>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setEditing(null)}
              disabled={editPending}
            >
              {t.common.cancel}
            </Button>
            <Button
              size="sm"
              className="h-8"
              onClick={() => void handleEdit()}
              disabled={editPending}
            >
              {editPending ? t.common.loading : t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* One-time plaintext secret reveal (create + rotate). */}
      <Dialog open={!!secret} onOpenChange={(open) => !open && setSecret(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{secret?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              {m.apiKeys.secretWarning}
            </p>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={secret?.apiKey ?? ""}
                onFocus={(e) => e.target.select()}
                className="h-8 font-mono text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                onClick={() => void handleCopySecret()}
              >
                <Copy className="mr-1.5 size-3.5" />
                {t.common.copy}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" className="h-8" onClick={() => setSecret(null)}>
              {t.common.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!rotating}
        onOpenChange={(open) => !rotatePending && !open && setRotating(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.apiKeys.rotate}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.apiKeys.rotateConfirm}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rotatePending}>
              {t.common.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={rotatePending}
              onClick={(e) => {
                e.preventDefault();
                void handleRotate();
              }}
            >
              {rotatePending ? t.common.loading : t.common.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeleteConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        itemName={deleting ? keyLabel(deleting) : ""}
        onConfirm={handleDelete}
      />
    </>
  );
}
