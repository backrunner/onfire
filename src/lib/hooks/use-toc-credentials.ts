"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

export interface TocCredentials {
  productId: string | null;
  token: string | null;
}

export interface TocCredentialsResult {
  credentials: TocCredentials;
  isValid: boolean;
  missingFields: ("productId" | "token")[];
}

export function useTocCredentials(): TocCredentialsResult {
  const searchParams = useSearchParams();

  return useMemo(() => {
    const productId = searchParams.get("productId");
    const token = searchParams.get("token");

    const missingFields: ("productId" | "token")[] = [];
    if (!productId) missingFields.push("productId");
    if (!token) missingFields.push("token");

    return {
      credentials: { productId, token },
      isValid: missingFields.length === 0,
      missingFields,
    };
  }, [searchParams]);
}
