"use client";

import { useMemo } from "react";
import { SWRConfig } from "swr";
import type { MeResponse } from "@/lib/api/types";
import { adminIdentityKey } from "@/lib/admin-cache";

/** Private data belongs to this authenticated tree, never the global SWR cache. */
export function AdminDataProvider({ me, children }: {
  me: MeResponse;
  children: React.ReactNode;
}) {
  const identity = adminIdentityKey(me);
  const config = useMemo(() => ({
    provider: () => new Map([["/api/tob/me", { data: me }]]),
  }), [me]);
  return <SWRConfig key={identity} value={config}>{children}</SWRConfig>;
}
