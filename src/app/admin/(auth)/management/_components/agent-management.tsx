"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api, qs, swrFetcher } from "@/lib/api/client";
import type { AgentView, TeamView } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  isAgent?: boolean;
}

interface AgentForm {
  userId: string;
  level: string;
  active: boolean;
  teamIds: string[];
}

const emptyForm = (): AgentForm => ({
  userId: "",
  level: "1",
  active: true,
  teamIds: [],
});

/** Validated agent level: integer within 1-10, or null. */
function parseLevel(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

export function AgentManagement({
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
  const canEditAgentFields = scope !== "product";
  const scopeQuery = qs({ scope, tenantId, productId });

  const {
    data: agents,
    error,
    isLoading,
    mutate,
  } = useSWR<AgentView[]>(`/api/tob/admin/agents${scopeQuery}`, swrFetcher);
  const { data: teams } = useSWR<TeamView[]>(`/api/tob/admin/teams${scopeQuery}`, swrFetcher);
  const { data: users } = useSWR<UserRow[]>(
    `/api/tob/admin/agents/eligible${scopeQuery}`,
    swrFetcher
  );

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AgentView | null>(null);
  const [removing, setRemoving] = useState<AgentView | null>(null);
  const [form, setForm] = useState<AgentForm>(emptyForm());
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const teamNames = useMemo(
    () => new Map((teams ?? []).map((team) => [team.id, team.name])),
    [teams]
  );

  /** Users that can still be promoted to agents. */
  const eligibleUsers = useMemo(() => {
    const inScope = new Set((agents ?? []).map((agent) => agent.userId));
    return (users ?? []).filter((user) => !inScope.has(user.id));
  }, [agents, users]);

  const filtered = useMemo(() => {
    const list = agents ?? [];
    const q = search.trim().toLowerCase();
    return q
      ? list.filter(
          (a) =>
            (a.displayName ?? "").toLowerCase().includes(q) ||
            (a.email ?? "").toLowerCase().includes(q)
        )
      : list;
  }, [agents, search]);

  const agentLabel = (agent: AgentView) =>
    agent.displayName || agent.email || agent.userId;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormErrors({});
    setDialogOpen(true);
  };

  const openEdit = (agent: AgentView) => {
    setEditing(agent);
    setForm({
      userId: agent.userId,
      level: String(agent.level),
      active: agent.active,
      teamIds: agent.teamIds ?? [],
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!editing && !form.userId) errors.userId = m.agents.selectUser;
    const level = parseLevel(form.level);
    if (canEditAgentFields && level === null) {
      errors.level = m.agents.levelInvalid;
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    try {
      if (editing) {
        await api.patch(`/api/tob/admin/agents/${editing.userId}`, {
          ...(canEditAgentFields ? { level, active: form.active } : {}),
          teamIds: form.teamIds,
          scope,
          tenantId,
          productId,
        });
        toast.success(m.toastUpdated);
      } else {
        await api.post("/api/tob/admin/agents", {
          userId: form.userId,
          ...(canEditAgentFields ? { level } : {}),
          scope,
          tenantId,
          productId,
          ...(form.teamIds.length > 0 ? { teamIds: form.teamIds } : {}),
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

  const handleToggleActive = async (agent: AgentView, active: boolean) => {
    setTogglingId(agent.userId);
    try {
      await api.patch(`/api/tob/admin/agents/${agent.userId}`, {
        active,
        scope,
        tenantId,
        productId,
      });
      toast.success(m.toastUpdated);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, m.loadFailed));
    } finally {
      setTogglingId(null);
    }
  };

  const handleRemove = async () => {
    if (!removing) return;
    try {
      await api.delete(`/api/tob/admin/agents/${removing.userId}${scopeQuery}`);
      toast.success(m.toastDeleted);
      setRemoving(null);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, m.loadFailed));
      throw err;
    }
  };

  const toggleTeam = (teamId: string, checked: boolean) => {
    setForm((f) => ({
      ...f,
      teamIds: checked
        ? [...f.teamIds, teamId]
        : f.teamIds.filter((id) => id !== teamId),
    }));
  };

  return (
    <>
      <ManagerPanel
        title={m.agents.title}
        description={m.agents.description}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={m.agents.searchAgent}
        actions={
          <Button size="sm" className="h-8" onClick={openCreate}>
            <Plus className="mr-1.5 size-3.5" />
            {m.agents.create}
          </Button>
        }
      >
        {isLoading ? (
          <TableSkeleton columns={5} />
        ) : error ? (
          <ErrorState onRetry={() => void mutate()} />
        ) : filtered.length === 0 ? (
          <EmptyState message={m.noData.replace("{{type}}", m.tabs.agents)} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.agents.displayName}</TableHead>
                <TableHead>{m.agents.level}</TableHead>
                <TableHead>{m.agents.teams}</TableHead>
                <TableHead>{m.agents.active}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((agent) => (
                <TableRow key={agent.userId}>
                  <TableCell>
                    <div className="text-sm font-medium">
                      {agent.displayName || "-"}
                    </div>
                    {agent.email && (
                      <div className="text-xs text-muted-foreground">
                        {agent.email}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">Lv.{agent.level}</Badge>
                  </TableCell>
                  <TableCell>
                    {(agent.teamIds ?? []).length === 0 ? (
                      <span className="text-sm text-muted-foreground">-</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(agent.teamIds ?? []).map((teamId) => (
                          <Badge key={teamId} variant="outline" className="text-xs">
                            {teamNames.get(teamId) ?? teamId}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={agent.active}
                      disabled={
                        !canEditAgentFields || togglingId === agent.userId
                      }
                      onCheckedChange={(checked) =>
                        void handleToggleActive(agent, checked)
                      }
                      aria-label={m.agents.active}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions
                      actions={[
                        {
                          label: t.common.edit,
                          icon: Pencil,
                          onSelect: () => openEdit(agent),
                        },
                        {
                          label: m.agents.remove,
                          icon: Trash2,
                          destructive: true,
                          separatorBefore: true,
                          onSelect: () => setRemoving(agent),
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
            <DialogTitle>{editing ? m.agents.edit : m.agents.create}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editing && (
              <FormField label={m.agents.user} required error={formErrors.userId}>
                {eligibleUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {m.agents.noEligibleUsers}
                  </p>
                ) : (
                  <Select
                    value={form.userId}
                    onValueChange={(v) => setForm((f) => ({ ...f, userId: v }))}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder={m.agents.selectUser} />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.displayName} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            )}

            {canEditAgentFields && (
            <FormField
              label={m.agents.level}
              htmlFor="agent-level"
              required
              hint={m.agents.levelHint}
              error={formErrors.level}
            >
              <Input
                id="agent-level"
                type="number"
                min={1}
                max={10}
                value={form.level}
                onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
                className="h-8"
              />
            </FormField>
            )}

            <FormField label={m.agents.teams}>
              {!teams || teams.length === 0 ? (
                <p className="text-sm text-muted-foreground">{m.agents.noTeams}</p>
              ) : (
                <ScrollArea className="max-h-44 rounded-md border">
                  <div className="space-y-1 p-2">
                    {teams.map((team) => (
                      <label
                        key={team.id}
                        className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <Checkbox
                          checked={form.teamIds.includes(team.id)}
                          onCheckedChange={(checked) =>
                            toggleTeam(team.id, checked === true)
                          }
                        />
                        {team.name}
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </FormField>

            {editing && canEditAgentFields && (
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm">{m.agents.active}</span>
                <Switch
                  checked={form.active}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, active: checked }))
                  }
                  aria-label={m.agents.active}
                />
              </div>
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
            <Button
              size="sm"
              className="h-8"
              onClick={handleSubmit}
              disabled={pending || (!editing && eligibleUsers.length === 0)}
            >
              {pending ? t.common.loading : t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        itemName={removing ? agentLabel(removing) : ""}
        onConfirm={handleRemove}
      />
    </>
  );
}
