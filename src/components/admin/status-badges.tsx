"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { TicketStatus, TicketPriority } from "@/lib/types";

const STATUS_STYLES: Record<TicketStatus, string> = {
  [TicketStatus.New]:
    "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-400",
  [TicketStatus.Processing]:
    "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400",
  [TicketStatus.Replied]:
    "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400",
  [TicketStatus.Escalated]:
    "bg-orange-500/10 text-orange-700 ring-orange-500/20 dark:text-orange-400",
  [TicketStatus.Closed]:
    "bg-zinc-500/10 text-zinc-600 ring-zinc-500/20 dark:text-zinc-400",
};

const PRIORITY_STYLES: Record<TicketPriority, string> = {
  [TicketPriority.High]:
    "bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-400",
  [TicketPriority.Medium]:
    "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400",
  [TicketPriority.Low]:
    "bg-zinc-500/10 text-zinc-600 ring-zinc-500/20 dark:text-zinc-400",
};

const badgeBase =
  "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap";

export function StatusBadge({
  status,
  className,
}: {
  status: TicketStatus;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <span className={cn(badgeBase, STATUS_STYLES[status], className)}>
      {t.tickets.status[status] ?? status}
    </span>
  );
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: TicketPriority;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <span className={cn(badgeBase, PRIORITY_STYLES[priority], className)}>
      {t.tickets.priority[priority] ?? priority}
    </span>
  );
}

export function SlaBadge({
  breached,
  className,
}: {
  breached: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  if (!breached) return null;
  return (
    <span
      className={cn(
        badgeBase,
        "bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-400",
        className
      )}
    >
      {t.tickets.detail.slaBreached}
    </span>
  );
}
