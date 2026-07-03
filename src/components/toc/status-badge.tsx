"use client";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { TicketStatus } from "@/lib/types";

/**
 * Customer-facing ticket status badge with semantic colors:
 * new=sky, processing=amber, replied=emerald, escalated=orange, closed=zinc.
 */
const statusStyles: Record<TicketStatus, string> = {
  [TicketStatus.New]:
    "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400",
  [TicketStatus.Processing]:
    "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  [TicketStatus.Replied]:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  [TicketStatus.Escalated]:
    "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  [TicketStatus.Closed]:
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

const dotStyles: Record<TicketStatus, string> = {
  [TicketStatus.New]: "bg-sky-500 dark:bg-sky-400",
  [TicketStatus.Processing]: "bg-amber-500 dark:bg-amber-400",
  [TicketStatus.Replied]: "bg-emerald-500 dark:bg-emerald-400",
  [TicketStatus.Escalated]: "bg-orange-500 dark:bg-orange-400",
  [TicketStatus.Closed]: "bg-zinc-400 dark:bg-zinc-500",
};

export function TocStatusBadge({
  status,
  className,
}: {
  status: TicketStatus;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors",
        statusStyles[status],
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full", dotStyles[status])} />
      {t.tickets.status[status]}
    </span>
  );
}
