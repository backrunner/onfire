import type { MeResponse } from "@/lib/api/types";

/** Include live scope and preview actor, not just the displayed user's ID. */
export function adminIdentityKey(me: MeResponse | null | undefined): string {
  return me ? JSON.stringify([me.user.id, me.role, [...me.permissions].sort(), [...me.tenantIds].sort(), [...me.productIds].sort(), [...me.teamIds].sort(), me.preview?.actor.id ?? null, me.preview?.target.id ?? null]) : "";
}

export const metadataCacheOptions = {
  revalidateOnFocus: false,
  dedupingInterval: 60_000,
} as const;
