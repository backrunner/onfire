"use client";

import { useEffect } from "react";
import useSWR from "swr";
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
  className?: string;
}

export function ProductSelect({
  value,
  onChange,
  placeholder,
  allLabel,
  autoSelectFirst,
  className,
}: ProductSelectProps) {
  const { data: products, isLoading } = useProducts();

  useEffect(() => {
    if (autoSelectFirst && !value && products && products.length > 0) {
      onChange(products[0].id);
    }
  }, [autoSelectFirst, value, products, onChange]);

  if (isLoading) {
    return <Skeleton className={cn("h-8 w-56", className)} />;
  }

  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className={cn("h-8 w-56 text-sm", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
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
