"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api, qs, swrFetcher } from "@/lib/api/client";
import { useMe } from "@/lib/hooks/use-me";
import type { AgentView, TeamView } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { ScrollArea } from "@/components/ui/scroll-area";
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

interface TeamDetail extends TeamView {
  memberIds: string[];
  productIds: string[];
}

export function TeamManagement({
  scope = "system",
  tenantId,
  productId,
}: {
  scope?: "system" | "tenant" | "product";
  tenantId?: string;
  productId?: string;
}) {
  const { t } = useI18n();
  const m = t.management;
  const { can } = useMe();
  const canSeeMembers = can("user.manage") || scope === "product";
  const scopeQuery = qs({ scope, tenantId, productId });

  const {
    data: teams,
    error,
    isLoading,
    mutate,
  } = useSWR<TeamView[]>(`/api/tob/admin/teams${scopeQuery}`, swrFetcher);
  const { data: products } = useSWR<Product[]>(
    scope === "tenant" ? "/api/tob/meta/products" : null,
    swrFetcher
  );
  const { data: agents } = useSWR<AgentView[]>(
    canSeeMembers ? `/api/tob/admin/agents${scopeQuery}` : null,
    swrFetcher
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TeamView | null>(null);
  const [deleting, setDeleting] = useState<TeamView | null>(null);
  const [form, setForm] = useState({ name: "", allowReassign: true });
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const memberCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const agent of agents ?? []) {
      for (const teamId of agent.teamIds ?? []) {
        counts.set(teamId, (counts.get(teamId) ?? 0) + 1);
      }
    }
    return counts;
  }, [agents]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", allowReassign: true });
    setSelectedProductIds([]);
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = async (team: TeamView) => {
    try {
      const detail = await api.get<TeamDetail>(`/api/tob/admin/teams/${team.id}`);
      setEditing(team);
      setForm({ name: detail.name, allowReassign: detail.allowReassign ?? true });
      const visibleProductIds = new Set((products ?? []).map((product) => product.id));
      setSelectedProductIds(
        detail.productIds.filter((productId) => visibleProductIds.has(productId))
      );
      setFormErrors({});
      setDialogOpen(true);
    } catch (err) {
      toast.error(errorMessage(err, m.loadFailed));
    }
  };

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = m.teams.nameRequired;
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    try {
      if (editing) {
        await api.patch(`/api/tob/admin/teams/${editing.id}`, {
          name: form.name.trim(),
          allowReassign: form.allowReassign,
          ...(scope === "tenant" ? { productIds: selectedProductIds } : {}),
        });
        toast.success(m.toastUpdated);
      } else {
        await api.post<TeamView>("/api/tob/admin/teams", {
          name: form.name.trim(),
          allowReassign: form.allowReassign,
          scope,
          tenantId,
          productId,
          productIds: scope === "tenant" ? selectedProductIds : undefined,
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

  const handleToggleReassign = async (team: TeamView, allowReassign: boolean) => {
    setTogglingId(team.id);
    try {
      await api.patch(`/api/tob/admin/teams/${team.id}`, { allowReassign });
      toast.success(m.toastUpdated);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, m.loadFailed));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await api.delete(`/api/tob/admin/teams/${deleting.id}`);
      toast.success(m.toastDeleted);
      setDeleting(null);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, m.loadFailed));
      throw err;
    }
  };

  const toggleProduct = (productId: string, checked: boolean) => {
    setSelectedProductIds((ids) =>
      checked ? [...ids, productId] : ids.filter((id) => id !== productId)
    );
  };

  return (
    <>
      <ManagerPanel
        title={m.tabs.teams}
        description={m.teams.description}
        actions={
          <Button size="sm" className="h-8" onClick={openCreate}>
            <Plus className="mr-1.5 size-3.5" />
            {m.teams.create}
          </Button>
        }
      >
        {isLoading ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState onRetry={() => void mutate()} />
        ) : !teams || teams.length === 0 ? (
          <EmptyState message={m.noData.replace("{{type}}", m.tabs.teams)} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.teams.name}</TableHead>
                {canSeeMembers && <TableHead>{m.teams.members}</TableHead>}
                <TableHead>{m.teams.allowReassign}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((team) => (
                <TableRow key={team.id}>
                  <TableCell className="text-sm font-medium">{team.name}</TableCell>
                  {canSeeMembers && (
                    <TableCell className="text-sm tabular-nums text-muted-foreground">
                      {memberCounts.get(team.id) ?? 0}
                    </TableCell>
                  )}
                  <TableCell>
                    <Switch
                      checked={team.allowReassign ?? true}
                      disabled={togglingId === team.id}
                      onCheckedChange={(checked) =>
                        void handleToggleReassign(team, checked)
                      }
                      aria-label={m.teams.allowReassign}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      actions={[
                        {
                          label: t.common.edit,
                          icon: Pencil,
                          onSelect: () => void openEdit(team),
                        },
                        {
                          label: t.common.delete,
                          icon: Trash2,
                          destructive: true,
                          separatorBefore: true,
                          onSelect: () => setDeleting(team),
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
            <DialogTitle>{editing ? m.teams.edit : m.teams.create}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FormField
              label={m.teams.name}
              htmlFor="team-name"
              required
              error={formErrors.name}
            >
              <Input
                id="team-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={m.teams.namePlaceholder}
                className="h-8"
              />
            </FormField>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label htmlFor="team-reassign" className="text-sm">
                {m.teams.allowReassign}
              </Label>
              <Switch
                id="team-reassign"
                checked={form.allowReassign}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, allowReassign: checked }))
                }
              />
            </div>

            {scope === "tenant" && <FormField label={m.teams.bindProducts}>
              {!products || products.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {m.teams.noProducts}
                </p>
              ) : (
                <ScrollArea className="max-h-44 rounded-md border">
                  <div className="space-y-1 p-2">
                    {products.map((product) => (
                      <label
                        key={product.id}
                        className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <Checkbox
                          checked={selectedProductIds.includes(product.id)}
                          onCheckedChange={(checked) =>
                            toggleProduct(product.id, checked === true)
                          }
                        />
                        {product.name}
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </FormField>}
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
