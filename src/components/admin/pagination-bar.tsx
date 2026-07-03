"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PaginationBarProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** Compact prev/next pagination control ("3 / 12"). */
export function PaginationBar({
  page,
  totalPages,
  onPageChange,
  className,
}: PaginationBarProps) {
  if (totalPages <= 1) return null;
  return (
    <div className={cn("flex items-center justify-end gap-2", className)}>
      <Button
        variant="outline"
        size="sm"
        className="size-8 p-0"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="text-xs tabular-nums text-muted-foreground">
        {page} / {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="size-8 p-0"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
