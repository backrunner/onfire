"use client";

import { useState } from "react";
import { toast } from "sonner";
import { UserPlus, XCircle, RefreshCw, X } from "lucide-react";
import { api } from "@/lib/api/client";
import { TicketStatus } from "@/lib/types";
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
import { ALL_STATUSES, interp, type BulkResponse } from "./utils";

interface BulkBarProps {
  selectedIds: string[];
  onClear: () => void;
  /** Called after any bulk mutation so the list revalidates. */
  onDone: () => void;
}

/** Floating action bar shown while tickets are multi-selected. */
export function BulkBar({ selectedIds, onClear, onDone }: BulkBarProps) {
  const { t } = useI18n();
  const { can } = useMe();
  const [assignOpen, setAssignOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const count = selectedIds.length;
  if (count === 0) return null;

  const reportResult = (result: BulkResponse) => {
    const summary = interp(t.tickets.bulk.result, {
      ok: result.succeeded,
      fail: result.failed,
    });
    if (result.failed > 0) {
      const details = result.results
        .filter((r) => !r.success)
        .slice(0, 3)
        .map((r) =>
          interp(t.tickets.bulk.failedItem, {
            id: r.id.length > 8 ? `${r.id.slice(0, 8)}…` : r.id,
            error: r.error ?? "",
          })
        )
        .join("\n");
      toast.warning(summary, { description: details });
    } else {
      toast.success(summary);
    }
    onDone();
    onClear();
  };

  const run = async (action: () => Promise<BulkResponse>) => {
    setBusy(true);
    try {
      const result = await action();
      reportResult(result);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2 shadow-sm">
      <span className="text-xs font-medium">
        {interp(t.tickets.list.selected, { count })}
      </span>

      {can("ticket.assign") && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={busy}
          onClick={() => setAssignOpen(true)}
        >
          <UserPlus />
          {t.tickets.bulk.assign}
        </Button>
      )}
      {can("ticket.write") && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={busy}
          onClick={() => {
            setStatus("");
            setStatusOpen(true);
          }}
        >
          <RefreshCw />
          {t.tickets.bulk.setStatus}
        </Button>
      )}
      {can("ticket.close") && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs text-destructive hover:text-destructive"
          disabled={busy}
          onClick={() => {
            setCloseReason("");
            setCloseOpen(true);
          }}
        >
          <XCircle />
          {t.tickets.bulk.close}
        </Button>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-7 text-xs text-muted-foreground"
        onClick={onClear}
      >
        <X />
        {t.tickets.list.clearSelection}
      </Button>

      <AssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        title={t.tickets.bulk.assignTitle}
        hint={interp(t.tickets.bulk.assignHint, { count })}
        onConfirm={async (assigneeId) => {
          const result = await api.post<BulkResponse>(
            "/api/tob/tickets/bulk/assign",
            { ticketIds: selectedIds, assigneeId }
          );
          reportResult(result);
        }}
      />

      {/* Bulk close confirmation */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.tickets.bulk.closeTitle}</DialogTitle>
            <DialogDescription>
              {interp(t.tickets.bulk.closeHint, { count })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <Label className="text-xs">{t.tickets.actions.closeReason}</Label>
            <Textarea
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
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
                const ok = await run(() =>
                  api.post<BulkResponse>("/api/tob/tickets/bulk/close", {
                    ticketIds: selectedIds,
                    reason: closeReason || t.tickets.bulk.defaultCloseReason,
                  })
                );
                if (ok) setCloseOpen(false);
              }}
            >
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk status confirmation */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.tickets.bulk.statusTitle}</DialogTitle>
            <DialogDescription>
              {interp(t.tickets.bulk.statusHint, { count })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-1">
            <Label className="text-xs">{t.tickets.actions.changeStatus}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder={t.common.status} />
              </SelectTrigger>
              <SelectContent>
                {ALL_STATUSES.filter((s) => s !== TicketStatus.Closed).map(
                  (s) => (
                    <SelectItem key={s} value={s}>
                      {t.tickets.status[s]}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setStatusOpen(false)} disabled={busy}>
              {t.common.cancel}
            </Button>
            <Button
              size="sm"
              disabled={!status || busy}
              onClick={async () => {
                const ok = await run(() =>
                  api.post<BulkResponse>("/api/tob/tickets/bulk/status", {
                    ticketIds: selectedIds,
                    status,
                  })
                );
                if (ok) setStatusOpen(false);
              }}
            >
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
