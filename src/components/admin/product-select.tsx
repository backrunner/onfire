"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { PackageOpen } from "lucide-react";
import { swrFetcher } from "@/lib/api/client";
import type { ProductView } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

/** Sentinel value for the "all products" option (Radix forbids empty values). */
export const ALL_PRODUCTS = "__all__";
const NO_PRODUCT = "__none__";

/** Products visible to the current user, shared via SWR. */
export function useProducts() {
  return useSWR<ProductView[]>("/api/tob/meta/products", swrFetcher, {
    revalidateOnFocus: false,
  });
}

interface ProductSelectProps {
  value: string;
  onChange: (productId: string) => void;
  placeholder: string;
  /** Adds an "all products" option using the ALL_PRODUCTS sentinel. */
  allLabel?: string;
  /** Auto-select the first product once loaded when no value is set. */
  autoSelectFirst?: boolean;
  /** Label shown in a stable disabled control when there are no products. */
  emptyLabel?: string;
  className?: string;
}

export function ProductSelect({
  value,
  onChange,
  placeholder,
  allLabel,
  autoSelectFirst,
  emptyLabel,
  className,
}: ProductSelectProps) {
  const { data: products, isLoading } = useProducts();

  useEffect(() => {
    if (autoSelectFirst && !value && products && products.length > 0) {
      onChange(products[0].id);
    } else if (
      products &&
      value &&
      value !== ALL_PRODUCTS &&
      !products.some((product) => product.id === value)
    ) {
      onChange("");
    }
  }, [autoSelectFirst, value, products, onChange]);

  if (isLoading) {
    return <Skeleton className={cn("h-8 w-56", className)} />;
  }

  if ((products?.length ?? 0) === 0) {
    return (
      <div
        aria-disabled="true"
        className={cn(
          "flex h-8 w-56 items-center gap-2 rounded-md border border-dashed border-border bg-muted/35 px-3 text-sm text-muted-foreground",
          className
        )}
      >
        <PackageOpen className="size-3.5 shrink-0" />
        <span className="truncate">{emptyLabel ?? placeholder}</span>
      </div>
    );
  }

  return (
    <Select
      value={value || NO_PRODUCT}
      onValueChange={(next) => next !== NO_PRODUCT && onChange(next)}
    >
      <SelectTrigger className={cn("h-8 w-56 text-sm", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_PRODUCT} disabled className="hidden">
          {placeholder}
        </SelectItem>
        {allLabel && <SelectItem value={ALL_PRODUCTS}>{allLabel}</SelectItem>}
        {(products ?? []).map((product) => (
          <SelectItem key={product.id} value={product.id}>
            {product.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
