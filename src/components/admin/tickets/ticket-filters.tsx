"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { AlertTriangle, Search } from "lucide-react";
import { swrFetcher } from "@/lib/api/client";
import type { ProductView, TeamView } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_STATUSES } from "./utils";
import { TicketPriority } from "@/lib/types";

export interface TicketFilters {
  status: string;
  priority: string;
  productId: string;
  teamId: string;
  overdue: boolean;
  q: string;
}

export const EMPTY_FILTERS: TicketFilters = {
  status: "",
  priority: "",
  productId: "",
  teamId: "",
  overdue: false,
  q: "",
};

const ALL = "__all__";

interface TicketFiltersBarProps {
  value: TicketFilters;
  onChange: (patch: Partial<TicketFilters>) => void;
}

/** Filter toolbar: search (debounced), status/priority/product/team, overdue toggle. */
export function TicketFiltersBar({ value, onChange }: TicketFiltersBarProps) {
  const { t } = useI18n();
  const { data: products } = useSWR<ProductView[]>(
    "/api/tob/meta/products",
    swrFetcher
  );
  const { data: teams } = useSWR<TeamView[]>("/api/tob/meta/teams", swrFetcher);

  // Debounced server-side search
  const [search, setSearch] = useState(value.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setSearch(value.q), [value.q]);

  const handleSearch = (next: string) => {
    setSearch(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange({ q: next }), 350);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[180px] flex-1">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={t.tickets.list.searchPlaceholder}
          className="h-8 pl-8 text-sm"
        />
      </div>

      <Select
        value={value.status || ALL}
        onValueChange={(v) => onChange({ status: v === ALL ? "" : v })}
      >
        <SelectTrigger className="h-8 w-[120px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t.tickets.filters.allStatus}</SelectItem>
          {ALL_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {t.tickets.status[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.priority || ALL}
        onValueChange={(v) => onChange({ priority: v === ALL ? "" : v })}
      >
        <SelectTrigger className="h-8 w-[120px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t.tickets.filters.allPriority}</SelectItem>
          {Object.values(TicketPriority).map((priority) => (
            <SelectItem key={priority} value={priority}>
              {t.tickets.priority[priority]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.productId || ALL}
        onValueChange={(v) => onChange({ productId: v === ALL ? "" : v })}
      >
        <SelectTrigger className="h-8 w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t.tickets.filters.allProduct}</SelectItem>
          {(products ?? []).map((product) => (
            <SelectItem key={product.id} value={product.id}>
              {product.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.teamId || ALL}
        onValueChange={(v) => onChange({ teamId: v === ALL ? "" : v })}
      >
        <SelectTrigger className="h-8 w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t.tickets.filters.allTeam}</SelectItem>
          {(teams ?? []).map((team) => (
            <SelectItem key={team.id} value={team.id}>
              {team.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant={value.overdue ? "default" : "outline"}
        size="sm"
        className={cn("h-8", !value.overdue && "text-muted-foreground")}
        onClick={() => onChange({ overdue: !value.overdue })}
        aria-pressed={value.overdue}
      >
        <AlertTriangle />
        {t.tickets.filters.overdueOnly}
      </Button>
    </div>
  );
}
