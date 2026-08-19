"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Glasses, Pencil, Plus, Trash2 } from "lucide-react";
import { usePreviewIdentity } from "@/lib/hooks/use-preview-identity";
import { useI18n } from "@/lib/i18n";
import { api, swrFetcher } from "@/lib/api/client";
import { useMe } from "@/lib/hooks/use-me";
import { Role } from "@/lib/types";
import { ROLE_HIERARCHY, canManageRole } from "@/lib/api-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  tenantId: string;
  role: Role;
  isAgent?: boolean;
  agentLevel?: number;
  agentActive?: boolean;
  productIds?: string[];
}

interface Tenant {
  id: string;
  name: string;
}

interface Product {
  id: string;
  tenantId: string;
  name: string;
}

const ROLE_BADGE: Record<Role, "default" | "secondary" | "destructive" | "outline"> = {
  [Role.SuperAdmin]: "destructive",
  [Role.TenantAdmin]: "default",
  [Role.ProductAdmin]: "secondary",
  [Role.TeamAdmin]: "outline",
  [Role.Agent]: "outline",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function UserManagement({ tenantId }: { tenantId?: string } = {}) {
  const { t } = useI18n();
  const m = t.management;
  const { me, can } = useMe();
  const { start } = usePreviewIdentity();
  const myRole = me?.role;
  const isSuperAdmin = can("tenant.manage");
  const showTenantColumn = isSuperAdmin && !tenantId;

  const roleLabels: Record<Role, string> = {
    [Role.SuperAdmin]: m.users.roles.superAdmin,
    [Role.TenantAdmin]: m.users.roles.tenantAdmin,
    [Role.ProductAdmin]: m.users.roles.productAdmin,
    [Role.TeamAdmin]: m.users.roles.teamAdmin,
    [Role.Agent]: m.users.roles.agent,
  };

  const {
    data: users,
    error,
    isLoading,
    mutate,
  } = useSWR<UserRow[]>("/api/tob/admin/users", swrFetcher);
  const { data: tenants } = useSWR<Tenant[]>(
    isSuperAdmin ? "/api/tob/admin/tenants" : null,
    swrFetcher
  );
  const { data: products } = useSWR<Product[]>(
    "/api/tob/meta/products",
    swrFetcher
  );

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [form, setForm] = useState({
    email: "",
    temporaryPassword: "",
    displayName: "",
    role: "" as Role | "",
    tenantId: "",
    productIds: [] as string[],
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const tenantNames = useMemo(
    () => new Map((tenants ?? []).map((tenant) => [tenant.id, tenant.name])),
    [tenants]
  );
  const productNames = useMemo(
    () => new Map((products ?? []).map((product) => [product.id, product.name])),
    [products]
  );
  const targetTenantId = form.tenantId || me?.user.tenantId;
  const availableProducts = (products ?? []).filter(
    (product) => !targetTenantId || product.tenantId === targetTenantId
  );

  /** Roles strictly below the current user's role, highest first. */
  const assignableRoles = useMemo(() => {
    if (!myRole) return [];
    return Object.values(Role)
      .filter((role) => canManageRole(myRole, role))
      .sort((a, b) => ROLE_HIERARCHY[b] - ROLE_HIERARCHY[a]);
  }, [myRole]);

  const canManageTarget = (user: UserRow) =>
    !!myRole && canManageRole(myRole, user.role);

  const filtered = useMemo(() => {
    const list = (users ?? []).filter(
      (user) => !tenantId || user.tenantId === tenantId
    );
    const q = search.trim().toLowerCase();
    return q
      ? list.filter(
          (u) =>
            u.email.toLowerCase().includes(q) ||
            u.displayName.toLowerCase().includes(q)
        )
      : list;
  }, [users, search, tenantId]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      email: "",
      temporaryPassword: "",
      displayName: "",
      role: "",
      tenantId: tenantId ?? "",
      productIds: [],
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = (user: UserRow) => {
    setEditing(user);
    setForm({
      email: user.email,
      temporaryPassword: "",
      displayName: user.displayName,
      role: user.role,
      tenantId: user.tenantId,
      productIds: user.productIds ?? [],
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!editing) {
      if (!form.email.trim()) errors.email = m.fieldRequired;
      else if (!EMAIL_RE.test(form.email.trim())) errors.email = m.users.emailInvalid;
      if (!form.temporaryPassword) errors.temporaryPassword = m.fieldRequired;
      else if (form.temporaryPassword.length < 8) {
        errors.temporaryPassword = m.users.passwordMinLength;
      }
    }
    if (!form.displayName.trim()) errors.displayName = m.fieldRequired;
    if (!form.role) errors.role = m.users.selectRole;
    if (form.role === Role.ProductAdmin && form.productIds.length === 0) {
      errors.productIds = m.users.productRequired;
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    try {
      if (editing) {
        await api.patch(`/api/tob/admin/users/${editing.id}`, {
          displayName: form.displayName.trim(),
          role: form.role,
          productIds:
            form.role === Role.ProductAdmin ? form.productIds : [],
        });
        toast.success(m.toastUpdated);
      } else {
        await api.post("/api/tob/admin/users", {
          email: form.email.trim(),
          temporaryPassword: form.temporaryPassword,
          displayName: form.displayName.trim(),
          role: form.role,
          ...(form.role === Role.ProductAdmin && {
            productIds: form.productIds,
          }),
          ...(isSuperAdmin && (form.tenantId || tenantId)
            ? { tenantId: form.tenantId || tenantId }
            : {}),
        });
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
      await api.delete(`/api/tob/admin/users/${deleting.id}`);
      toast.success(m.toastDeleted);
      setDeleting(null);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, m.loadFailed));
      throw err;
    }
  };

  return (
    <>
      <ManagerPanel
        title={m.users.accounts}
        description={m.users.description}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={m.users.searchEmail}
        actions={
          <Button size="sm" className="h-8" onClick={openCreate}>
            <Plus className="mr-1.5 size-3.5" />
            {m.users.create}
          </Button>
        }
      >
        {isLoading ? (
          <TableSkeleton columns={showTenantColumn ? 7 : 6} />
        ) : error ? (
          <ErrorState onRetry={() => void mutate()} />
        ) : filtered.length === 0 ? (
          <EmptyState message={m.noData.replace("{{type}}", m.tabs.users)} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.users.displayName}</TableHead>
                <TableHead>{m.users.email}</TableHead>
                <TableHead>{m.users.role}</TableHead>
                <TableHead>{m.users.products}</TableHead>
                {showTenantColumn && <TableHead>{m.users.tenant}</TableHead>}
                <TableHead>{m.tabs.agents}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user) => {
                const manageable = canManageTarget(user);
                return (
                  <TableRow key={user.id}>
                    <TableCell className="text-sm font-medium">
                      {user.displayName}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ROLE_BADGE[user.role]}>
                        {roleLabels[user.role]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-56 text-sm text-muted-foreground">
                      {user.role === Role.ProductAdmin
                        ? (user.productIds ?? [])
                            .map((id) => productNames.get(id) ?? id)
                            .join(", ") || "-"
                        : "-"}
                    </TableCell>
                    {showTenantColumn && (
                      <TableCell className="text-sm text-muted-foreground">
                        {tenantNames.get(user.tenantId) ?? user.tenantId}
                      </TableCell>
                    )}
                    <TableCell>
                      {user.isAgent ? (
                        <Badge
                          variant={user.agentActive ? "outline" : "secondary"}
                          className={
                            user.agentActive
                              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : undefined
                          }
                        >
                          Lv.{user.agentLevel}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {manageable && (
                        <RowActions
                          actions={[
                            {
                              label: t.preview.startThis,
                              icon: Glasses,
                              onSelect: () => {
                                void start(user.id).catch((error) =>
                                  toast.error(
                                    error instanceof Error
                                      ? error.message
                                      : t.preview.startFailed
                                  )
                                );
                              },
                            },
                            {
                              label: t.common.edit,
                              icon: Pencil,
                              onSelect: () => openEdit(user),
                            },
                            {
                              label: t.common.delete,
                              icon: Trash2,
                              destructive: true,
                              separatorBefore: true,
                              onSelect: () => setDeleting(user),
                            },
                          ]}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </ManagerPanel>

      <Dialog open={dialogOpen} onOpenChange={(open) => !pending && setDialogOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? m.users.edit : m.users.create}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FormField
              label={m.users.email}
              htmlFor="user-email"
              required
              error={formErrors.email}
            >
              <Input
                id="user-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                disabled={!!editing}
                className="h-8"
              />
            </FormField>

            {!editing && (
              <FormField
                label={m.users.temporaryPassword}
                htmlFor="user-temporary-password"
                required
                error={formErrors.temporaryPassword}
                hint={m.users.temporaryPasswordHint}
              >
                <Input
                  id="user-temporary-password"
                  type="password"
                  autoComplete="new-password"
                  value={form.temporaryPassword}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      temporaryPassword: e.target.value,
                    }))
                  }
                  className="h-8"
                />
              </FormField>
            )}

            <FormField
              label={m.users.displayName}
              htmlFor="user-name"
              required
              error={formErrors.displayName}
            >
              <Input
                id="user-name"
                value={form.displayName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, displayName: e.target.value }))
                }
                className="h-8"
              />
            </FormField>

            <FormField label={m.users.role} required error={formErrors.role}>
              <Select
                value={form.role}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    role: v as Role,
                    ...(v !== Role.ProductAdmin && { productIds: [] }),
                  }))
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder={m.users.selectRole} />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {roleLabels[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            {form.role === Role.ProductAdmin && (
              <FormField
                label={m.users.products}
                required
                error={formErrors.productIds}
              >
                {availableProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {m.users.noProducts}
                  </p>
                ) : (
                  <ScrollArea className="max-h-40 rounded-md border">
                    <div className="space-y-1 p-2">
                      {availableProducts.map((product) => (
                        <label
                          key={product.id}
                          className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                        >
                          <Checkbox
                            checked={form.productIds.includes(product.id)}
                            onCheckedChange={(checked) =>
                              setForm((current) => ({
                                ...current,
                                productIds:
                                  checked === true
                                    ? [...current.productIds, product.id]
                                    : current.productIds.filter(
                                        (id) => id !== product.id
                                      ),
                              }))
                            }
                          />
                          {product.name}
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </FormField>
            )}

            {showTenantColumn && !editing && (
              <FormField label={m.users.tenant}>
                <Select
                  value={form.tenantId}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, tenantId: v, productIds: [] }))
                  }
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder={m.products.selectTenant} />
                  </SelectTrigger>
                  <SelectContent>
                    {(tenants ?? []).map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}
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
        itemName={deleting?.displayName || deleting?.email || ""}
        onConfirm={handleDelete}
        requireNameConfirmation
      />
    </>
  );
}
