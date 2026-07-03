"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { swrFetcher, qs } from "@/lib/api/client";
import type { AgentView, TeamView } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface AssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  hint?: string;
  /** When set, the team is fixed (single-ticket assign) and only agents of that team are listed. */
  lockedTeamId?: string;
  /** Excluded from the picker (already assigned). */
  currentAssigneeId?: string | null;
  onConfirm: (assigneeId: string) => Promise<void>;
}

/**
 * Team → agent picker dialog used by single-ticket assign and bulk assign.
 */
export function AssignDialog({
  open,
  onOpenChange,
  title,
  hint,
  lockedTeamId,
  currentAssigneeId,
  onConfirm,
}: AssignDialogProps) {
  const { t } = useI18n();
  const [teamId, setTeamId] = useState<string>("");
  const [agentId, setAgentId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const effectiveTeamId = lockedTeamId ?? teamId;

  const { data: teams } = useSWR<TeamView[]>(
    open && !lockedTeamId ? "/api/tob/meta/teams" : null,
    swrFetcher
  );

  const {
    data: agents,
    error: agentsError,
    isLoading: agentsLoading,
  } = useSWR<AgentView[]>(
    open && effectiveTeamId
      ? `/api/tob/meta/agents${qs({ teamId: effectiveTeamId, active: "true" })}`
      : null,
    swrFetcher
  );

  const candidates = (agents ?? []).filter(
    (a) => a.userId !== currentAssigneeId
  );

  const reset = () => {
    setTeamId("");
    setAgentId("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleConfirm = async () => {
    if (!agentId) return;
    setSubmitting(true);
    try {
      await onConfirm(agentId);
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {hint && <DialogDescription>{hint}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-4 py-1">
          {!lockedTeamId && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t.tickets.actions.selectTeam}</Label>
              <Select
                value={teamId}
                onValueChange={(v) => {
                  setTeamId(v);
                  setAgentId("");
                }}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder={t.tickets.actions.selectTeam} />
                </SelectTrigger>
                <SelectContent>
                  {(teams ?? []).map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">{t.tickets.actions.selectAgent}</Label>
            {agentsLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : agentsError ? (
              <p className="text-xs text-destructive">
                {t.tickets.actions.agentsLoadError}
              </p>
            ) : effectiveTeamId && candidates.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t.tickets.actions.noAgents}
              </p>
            ) : (
              <Select
                value={agentId}
                onValueChange={setAgentId}
                disabled={!effectiveTeamId}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder={t.tickets.actions.selectAgent} />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((agent) => (
                    <SelectItem key={agent.userId} value={agent.userId}>
                      {agent.displayName || agent.email || agent.userId}
                      <span className="ml-1 text-muted-foreground">
                        · Lv{agent.level}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            {t.common.cancel}
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!agentId || submitting}
          >
            {t.common.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
