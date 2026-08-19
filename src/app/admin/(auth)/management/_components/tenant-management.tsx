"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Pencil, Plus, Settings, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { api, swrFetcher } from "@/lib/api/client";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  defaultTeamId?: string | null;
}

interface Team {
  id: string;
  tenantId: string | null;
  scope?: "system" | "tenant" | "product";
  name: string;
}

const NONE = "__none__";

export function TenantManagement() {
  const router = useRouter();
  const { t } = useI18n();
  const m = t.management;

  const {
    data: tenants,
    error,
    isLoading,
    mutate,
  } = useSWR<Tenant[]>("/api/tob/admin/tenants", swrFetcher);
  const { data: teams } = useSWR<Team[]>("/api/tob/admin/teams", swrFetcher);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [deleting, setDeleting] = useState<Tenant | null>(null);
  const [form, setForm] = useState({ name: "", defaultTeamId: NONE });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const teamNames = useMemo(
    () => new Map((teams ?? []).map((team) => [team.id, team.name])),
    [teams]
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", defaultTeamId: NONE });
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = (tenant: Tenant) => {
    setEditing(tenant);
    setForm({ name: tenant.name, defaultTeamId: tenant.defaultTeamId || NONE });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = m.tenants.nameRequired;
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    try {
      if (editing) {
        await api.patch(`/api/tob/admin/tenants/${editing.id}`, {
          name: form.name.trim(),
          defaultTeamId: form.defaultTeamId === NONE ? null : form.defaultTeamId,
        });
        toast.success(m.toastUpdated);
      } else {
        await api.post("/api/tob/admin/tenants", {
          name: form.name.trim(),
          ...(form.defaultTeamId !== NONE
            ? { defaultTeamId: form.defaultTeamId }
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
      await api.delete(`/api/tob/admin/tenants/${deleting.id}`);
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
        title={m.tabs.tenants}
        description={m.tenants.description}
        actions={
          <Button size="sm" className="h-8" onClick={openCreate}>
            <Plus className="mr-1.5 size-3.5" />
            {m.tenants.create}
          </Button>
        }
      >
        {isLoading ? (
          <TableSkeleton columns={3} />
        ) : error ? (
          <ErrorState onRetry={() => void mutate()} />
        ) : !tenants || tenants.length === 0 ? (
          <EmptyState message={m.noData.replace("{{type}}", m.tabs.tenants)} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.tenants.name}</TableHead>
                <TableHead>{m.tenants.defaultTeam}</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell className="text-sm font-medium">
                    {tenant.name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {tenant.defaultTeamId
                      ? teamNames.get(tenant.defaultTeamId) ?? tenant.defaultTeamId
                      : m.tenants.noDefaultTeam}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={m.manage}
                            onClick={() =>
                              router.push(`/admin/management/tenants/${tenant.id}`)
                            }
                          >
                            <Settings className="size-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{m.manage}</TooltipContent>
                      </Tooltip>
                      <RowActions
                        actions={[
                          {
                            label: t.common.edit,
                            icon: Pencil,
                            onSelect: () => openEdit(tenant),
                          },
                          {
                            label: t.common.delete,
                            icon: Trash2,
                            destructive: true,
                            separatorBefore: true,
                            onSelect: () => setDeleting(tenant),
                          },
                        ]}
                      />
                    </div>
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
              {editing ? m.tenants.edit : m.tenants.create}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FormField
              label={m.tenants.name}
              htmlFor="tenant-name"
              required
              error={formErrors.name}
            >
              <Input
                id="tenant-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={m.tenants.namePlaceholder}
                className="h-8"
              />
            </FormField>
            {editing && (
            <FormField label={m.tenants.defaultTeam}>
              <Select
                value={form.defaultTeamId}
                onValueChange={(v) => setForm((f) => ({ ...f, defaultTeamId: v }))}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{m.tenants.noDefaultTeam}</SelectItem>
                  {(teams ?? [])
                    .filter(
                      (team) =>
                        team.tenantId === editing.id &&
                        (team.scope ?? "tenant") === "tenant"
                    )
                    .map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
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
        itemName={deleting?.name || ""}
        onConfirm={handleDelete}
      />
    </>
  );
}
