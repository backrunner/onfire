"use client";

import useSWR from "swr";
import { swrFetcher } from "@/lib/api/client";
import type { MeResponse } from "@/lib/api/types";
import type { Permission } from "@/lib/types";

/**
 * Current ToB user context (role, permissions, scope). Cached and shared
 * across the admin app via SWR.
 */
export function useMe() {
  const { data, error, isLoading, mutate } = useSWR<MeResponse>(
    "/api/tob/me",
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  const can = (permission: Permission): boolean =>
    data?.permissions?.includes(permission) ?? false;

  return { me: data, can, error, isLoading, mutate };
}
