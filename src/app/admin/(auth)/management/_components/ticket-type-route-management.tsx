"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Pencil, Unlink } from "lucide-react";
import { toast } from "sonner";
import { api, swrFetcher } from "@/lib/api/client";
import type { TeamView } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyState,
  ErrorState,
  FormField,
  ManagerPanel,
  RowActions,
  TableSkeleton,
  errorMessage,
} from "./manager-ui";
import {
  ticketTypePathLabel,
  type TicketTypeAdminView,
} from "./ticket-type-management";

export function TicketTypeRouteManagement() {
  const { t } = useI18n();
  const m = t.management.ticketTypeRoutes;
  const { data, error, isLoading, mutate } = useSWR<TicketTypeAdminView[]>(
    "/api/tob/admin/ticket-types",
    swrFetcher
  );
  const { data: teams } = useSWR<TeamView[]>("/api/tob/meta/teams", swrFetcher);
  const [editing, setEditing] = useState<TicketTypeAdminView | null>(null);
  const [teamId, setTeamId] = useState("");
  const [pending, setPending] = useState(false);
  const byId = useMemo(() => new Map((data ?? []).map((item) => [item.id, item])), [data]);
  const teamNames = useMemo(() => new Map((teams ?? []).map((team) => [team.id, team.name])), [teams]);
  const rows = useMemo(
    () => (data ?? [])
      .filter(
        (item) =>
          !item.archivedAt &&
          (!item.systemKey || item.systemKey === "unclassified")
      )
      .map((item) => ({ item, path: item.systemKey === "unclassified" ? m.unclassified : ticketTypePathLabel(item, byId) }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    [data, byId, m.unclassified]
  );

  const inherited = (item: TicketTypeAdminView) => {
    let current: TicketTypeAdminView | undefined = item;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      if (current.route) return { route: current.route, inherited: current.id !== item.id };
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return null;
  };
  const save = async () => {
    if (!editing || !teamId) return;
    setPending(true);
    try {
      await api.patch(`/api/tob/admin/ticket-types/${editing.id}/team-route`, { teamId });
      toast.success(t.management.toastUpdated);
      setEditing(null);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, t.management.loadFailed));
    } finally {
      setPending(false);
    }
  };
  const clear = async (item: TicketTypeAdminView) => {
    try {
      await api.delete(`/api/tob/admin/ticket-types/${item.id}/team-route`);
      toast.success(t.management.toastUpdated);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, t.management.loadFailed));
    }
  };

  return (
    <>
      <ManagerPanel title={m.title} description={m.description}>
        {isLoading ? <TableSkeleton /> : error ? <ErrorState onRetry={() => void mutate()} /> : rows.length === 0 ? (
          <EmptyState message={m.empty} />
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>{m.type}</TableHead><TableHead>{m.directTeam}</TableHead><TableHead>{m.effectiveTeam}</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
            <TableBody>
              {rows.map(({ item, path }) => {
                const effective = inherited(item);
                return (
                  <TableRow key={item.id}>
                    <TableCell className="text-sm font-medium">{path}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.route ? teamNames.get(item.route.teamId) ?? item.route.teamId : "—"}</TableCell>
                    <TableCell className="text-sm">{effective ? `${teamNames.get(effective.route.teamId) ?? effective.route.teamId}${effective.inherited ? ` (${m.inherited})` : ""}` : m.tenantDefault}</TableCell>
                    <TableCell className="text-right"><RowActions actions={[
                      { label: t.common.edit, icon: Pencil, onSelect: () => { setEditing(item); setTeamId(item.route?.teamId ?? ""); } },
                      ...(item.route ? [{ label: m.clear, icon: Unlink, separatorBefore: true, destructive: true, onSelect: () => void clear(item) }] : []),
                    ]} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </ManagerPanel>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !pending && !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{m.edit}</DialogTitle></DialogHeader>
          <FormField label={m.team} required>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger className="h-8"><SelectValue placeholder={m.selectTeam} /></SelectTrigger>
              <SelectContent>{(teams ?? []).map((team) => <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
          <DialogFooter><Button variant="outline" size="sm" onClick={() => setEditing(null)} disabled={pending}>{t.common.cancel}</Button><Button size="sm" onClick={() => void save()} disabled={pending || !teamId}>{pending ? t.common.loading : t.common.save}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
