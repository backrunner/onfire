"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api, qs, swrFetcher } from "@/lib/api/client";
import type { TeamView } from "@/lib/api/types";
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

interface Product {
  id: string;
  name: string;
}

interface CategoryRouteView {
  id: string;
  productId: string;
  category: string;
  subcategory: string | null;
  teamId: string;
}

interface RouteForm {
  productId: string;
  category: string;
  subcategory: string;
  teamId: string;
}

const ALL = "all";

const emptyForm = (): RouteForm => ({
  productId: "",
  category: "",
  subcategory: "",
  teamId: "",
});

export function CategoryRouteManagement() {
  const { t } = useI18n();
  const m = t.management;

  const [productFilter, setProductFilter] = useState<string>(ALL);

  const {
    data: routes,
    error,
    isLoading,
    mutate,
  } = useSWR<CategoryRouteView[]>(
    `/api/tob/admin/category-routes${qs({
      productId: productFilter === ALL ? undefined : productFilter,
    })}`,
    swrFetcher
  );
  const { data: products } = useSWR<Product[]>(
    "/api/tob/meta/products",
    swrFetcher
  );
  const { data: teams } = useSWR<TeamView[]>("/api/tob/meta/teams", swrFetcher);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRouteView | null>(null);
  const [deleting, setDeleting] = useState<CategoryRouteView | null>(null);
  const [form, setForm] = useState<RouteForm>(emptyForm());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const productNames = useMemo(
    () => new Map((products ?? []).map((product) => [product.id, product.name])),
    [products]
  );
  const teamNames = useMemo(
    () => new Map((teams ?? []).map((team) => [team.id, team.name])),
    [teams]
  );

  const routeLabel = (route: CategoryRouteView) =>
    route.subcategory ? `${route.category} / ${route.subcategory}` : route.category;

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm(),
      productId: productFilter === ALL ? "" : productFilter,
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = (route: CategoryRouteView) => {
    setEditing(route);
    setForm({
      productId: route.productId,
      category: route.category,
      subcategory: route.subcategory ?? "",
      teamId: route.teamId,
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!editing && !form.productId) errors.productId = m.categoryRoutes.selectProduct;
    if (!form.category.trim()) errors.category = m.fieldRequired;
    if (!form.teamId) errors.teamId = m.categoryRoutes.selectTeam;
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const subcategory = form.subcategory.trim();

    setPending(true);
    try {
      if (editing) {
        await api.patch(`/api/tob/admin/category-routes/${editing.id}`, {
          category: form.category.trim(),
          subcategory: subcategory || null,
          teamId: form.teamId,
        });
        toast.success(m.toastUpdated);
      } else {
        await api.post("/api/tob/admin/category-routes", {
          productId: form.productId,
          category: form.category.trim(),
          ...(subcategory ? { subcategory } : {}),
          teamId: form.teamId,
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
      await api.delete(`/api/tob/admin/category-routes/${deleting.id}`);
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
        title={m.categoryRoutes.title}
        description={m.categoryRoutes.description}
        actions={
          <>
            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger className="h-8 w-44 text-sm">
                <SelectValue placeholder={m.categoryRoutes.allProducts} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{m.categoryRoutes.allProducts}</SelectItem>
                {(products ?? []).map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8" onClick={openCreate}>
              <Plus className="mr-1.5 size-3.5" />
              {m.categoryRoutes.create}
            </Button>
          </>
        }
      >
        <p className="mb-4 text-xs text-muted-foreground">
          {m.categoryRoutes.hint}
        </p>
        {isLoading ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState onRetry={() => void mutate()} />
        ) : !routes || routes.length === 0 ? (
          <EmptyState message={m.categoryRoutes.noRoutes} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.categoryRoutes.product}</TableHead>
                <TableHead>{m.categoryRoutes.category}</TableHead>
                <TableHead>{m.categoryRoutes.subcategory}</TableHead>
                <TableHead>{m.categoryRoutes.team}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {routes.map((route) => (
                <TableRow key={route.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {productNames.get(route.productId) ?? route.productId}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {route.category}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {route.subcategory || "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {teamNames.get(route.teamId) ?? route.teamId}
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      actions={[
                        {
                          label: t.common.edit,
                          icon: Pencil,
                          onSelect: () => openEdit(route),
                        },
                        {
                          label: t.common.delete,
                          icon: Trash2,
                          destructive: true,
                          separatorBefore: true,
                          onSelect: () => setDeleting(route),
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ManagerPanel>

      <Dialog open={dialogOpen} onOpenChange={(open) => !pending && setDialogOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? m.categoryRoutes.edit : m.categoryRoutes.create}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FormField
              label={m.categoryRoutes.product}
              required
              error={formErrors.productId}
            >
              <Select
                value={form.productId}
                onValueChange={(v) => setForm((f) => ({ ...f, productId: v }))}
                disabled={!!editing}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder={m.categoryRoutes.selectProduct} />
                </SelectTrigger>
                <SelectContent>
                  {(products ?? []).map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField
              label={m.categoryRoutes.category}
              htmlFor="route-category"
              required
              error={formErrors.category}
            >
              <Input
                id="route-category"
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value }))
                }
                placeholder={m.categoryRoutes.categoryPlaceholder}
                className="h-8"
              />
            </FormField>

            <FormField label={m.categoryRoutes.subcategory} htmlFor="route-subcategory">
              <Input
                id="route-subcategory"
                value={form.subcategory}
                onChange={(e) =>
                  setForm((f) => ({ ...f, subcategory: e.target.value }))
                }
                placeholder={m.categoryRoutes.subcategoryPlaceholder}
                className="h-8"
              />
            </FormField>

            <FormField
              label={m.categoryRoutes.team}
              required
              error={formErrors.teamId}
            >
              <Select
                value={form.teamId}
                onValueChange={(v) => setForm((f) => ({ ...f, teamId: v }))}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder={m.categoryRoutes.selectTeam} />
                </SelectTrigger>
                <SelectContent>
                  {(teams ?? []).map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
        itemName={deleting ? routeLabel(deleting) : ""}
        onConfirm={handleDelete}
      />
    </>
  );
}
