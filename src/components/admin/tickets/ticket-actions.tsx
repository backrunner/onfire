"use client";

import { useState } from "react";
import { toast } from "sonner";
import { UserPlus, ArrowUpRight, XCircle } from "lucide-react";
import { api } from "@/lib/api/client";
import type { TicketView } from "@/lib/api/types";
import { TicketStatus, TicketPriority } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { AssignDialog } from "./assign-dialog";
import { ALL_STATUSES, VALID_TRANSITIONS } from "./utils";

interface TicketActionsProps {
  ticket: TicketView;
  /** Revalidate detail + list after a successful mutation. */
  onMutated: () => void;
}

const PRIORITIES = [
  TicketPriority.High,
  TicketPriority.Medium,
  TicketPriority.Low,
] as const;

/** Action toolbar for a single ticket, gated by the current user's permissions. */
export function TicketActions({ ticket, onMutated }: TicketActionsProps) {
  const { t } = useI18n();
  const { can } = useMe();
  const [assignOpen, setAssignOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const isClosed = ticket.status === TicketStatus.Closed;

  const run = async (action: () => Promise<unknown>, successMsg: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(successMsg);
      onMutated();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {can("ticket.assign") && !isClosed && (
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => setAssignOpen(true)}
        >
          <UserPlus />
          {ticket.assigneeId
            ? t.tickets.actions.reassign
            : t.tickets.actions.assign}
        </Button>
      )}

      {can("ticket.escalate") &&
        !isClosed &&
        ticket.status !== TicketStatus.Escalated && (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => {
              setReason("");
              setEscalateOpen(true);
            }}
          >
            <ArrowUpRight />
            {t.tickets.actions.escalate}
          </Button>
        )}

      {can("ticket.close") && !isClosed && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-destructive hover:text-destructive"
          onClick={() => {
            setReason("");
            setCloseOpen(true);
          }}
        >
          <XCircle />
          {t.tickets.actions.close}
        </Button>
      )}

      {can("ticket.write") && (
        <>
          <Select
            value={ticket.status}
            disabled={busy || isClosed}
            onValueChange={(value) =>
              run(
                () => api.post(`/api/tob/tickets/${ticket.id}/status`, { status: value }),
                t.tickets.actions.statusUpdated
              )
            }
          >
            <SelectTrigger className="h-8 w-[130px]" aria-label={t.tickets.actions.changeStatus}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_STATUSES.map((status) => (
                <SelectItem
                  key={status}
                  value={status}
                  disabled={
                    status !== ticket.status &&
                    !VALID_TRANSITIONS[ticket.status].includes(status)
                  }
                >
                  {t.tickets.status[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={ticket.priority}
            disabled={busy || isClosed}
            onValueChange={(value) =>
              run(
                () => api.post(`/api/tob/tickets/${ticket.id}/priority`, { priority: value }),
                t.tickets.actions.priorityUpdated
              )
            }
          >
            <SelectTrigger className="h-8 w-[100px]" aria-label={t.tickets.actions.changePriority}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {t.tickets.priority[priority]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}

      <AssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        title={
          ticket.assigneeId
            ? t.tickets.actions.reassign
            : t.tickets.actions.assign
        }
        lockedTeamId={ticket.teamId}
        currentAssigneeId={ticket.assigneeId}
        onConfirm={async (assigneeId) => {
          await api.post(`/api/tob/tickets/${ticket.id}/assign`, { assigneeId });
          toast.success(t.tickets.actions.assignSuccess);
          onMutated();
        }}
      />

      {/* Escalate dialog */}
      <Dialog open={escalateOpen} onOpenChange={setEscalateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.tickets.actions.escalate}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <Label className="text-xs">{t.tickets.actions.escalateReason}</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t.tickets.actions.escalatePlaceholder}
              rows={3}
              className="text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEscalateOpen(false)} disabled={busy}>
              {t.common.cancel}
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                const ok = await run(
                  () =>
                    api.post(`/api/tob/tickets/${ticket.id}/escalate`, {
                      reason: reason || undefined,
                    }),
                  t.tickets.actions.escalateSuccess
                );
                if (ok) setEscalateOpen(false);
              }}
            >
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close dialog */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.tickets.actions.closeConfirmTitle}</DialogTitle>
            <DialogDescription>
              {t.tickets.actions.closeConfirmMessage}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <Label className="text-xs">{t.tickets.actions.closeReason}</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t.tickets.actions.closePlaceholder}
              rows={3}
              className="text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCloseOpen(false)} disabled={busy}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={async () => {
                const ok = await run(
                  () =>
                    api.post(`/api/tob/tickets/${ticket.id}/close`, {
                      reason: reason || undefined,
                    }),
                  t.tickets.actions.closeSuccess
                );
                if (ok) setCloseOpen(false);
              }}
            >
              {t.tickets.actions.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
