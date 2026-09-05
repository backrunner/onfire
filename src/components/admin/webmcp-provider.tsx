"use client";

import { useEffect, useRef } from "react";
import { useSWRConfig } from "swr";
import { useMe } from "@/lib/hooks/use-me";
import { getWebMcpContext, identityKey, WebMcpRegistry } from "@/lib/webmcp/runtime";
import type { WebMcpOperation } from "@/lib/webmcp/catalog";

/** Lives only in the authenticated Dashboard shell, across client-side navigation. */
export function WebMcpProvider() {
  const { me, error, mutate: refreshMe } = useMe();
  const { mutate } = useSWRConfig();
  const registry = useRef<WebMcpRegistry | null>(null);
  const current = useRef(me);
  current.current = error ? undefined : me;
  const key = error ? "" : identityKey(me);

  useEffect(() => {
    const context = getWebMcpContext(document, navigator);
    if (!context) return;
    let reported = false;
    const instance = new WebMcpRegistry(context, {
      onIdentity: (identity) => { void mutate("/api/tob/me", identity ?? undefined, { revalidate: false }); },
      onMutation: (operation) => refreshForOperation(mutate as unknown as RefreshMutator, operation),
      onRegistrationError: () => {
        if (!reported) console.warn("OnFire WebMCP registration is unavailable for one or more tools in this browser.");
        reported = true;
      },
    });
    registry.current = instance;
    void instance.setIdentity(current.current ?? null);
    let active = true;
    let refreshFlight: Promise<void> | null = null;
    let refreshVersion = 0;
    const refresh = () => {
      if (!active || document.visibilityState !== "visible") return;
      if (refreshFlight) return;
      const version = ++refreshVersion;
      refreshFlight = refreshMe()
        .then((identity) => {
          if (active && version === refreshVersion) return instance.setIdentity(identity ?? null);
        })
        .catch(() => {
          if (active && version === refreshVersion) return instance.setIdentity(null);
        })
        .then(() => undefined)
        .finally(() => { refreshFlight = null; });
    };
    let timer: number | null = null;
    const stopPolling = () => {
      if (timer !== null) { window.clearInterval(timer); timer = null; }
    };
    const startPolling = () => {
      if (!active || document.visibilityState !== "visible" || timer !== null) return;
      timer = window.setInterval(refresh, 30_000);
      refresh();
    };
    const visibility = () => {
      if (document.visibilityState === "visible") startPolling();
      else stopPolling();
    };
    const pagehide = () => { void instance.dispose(); };
    startPolling();
    window.addEventListener("focus", startPolling);
    window.addEventListener("pageshow", startPolling);
    window.addEventListener("pagehide", pagehide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      stopPolling();
      window.removeEventListener("focus", startPolling);
      window.removeEventListener("pageshow", startPolling);
      window.removeEventListener("pagehide", pagehide);
      document.removeEventListener("visibilitychange", visibility);
      registry.current = null;
      void instance.dispose();
    };
  }, [mutate, refreshMe]);

  useEffect(() => { void registry.current?.setIdentity(current.current ?? null); }, [key]);
  return null;
}

/** Invalidate only the SWR resources affected by a browser tool mutation. */
async function refreshForOperation(
  mutate: RefreshMutator,
  operation: WebMcpOperation,
) {
  const path = operation.path;
  const ticketMutation = /\/tickets(?:\/|$)/.test(path) || path.includes("/email-logs/");
  const productMutation = path.includes("/admin/products");
  const prefix = path.split("/:")[0].replace(/\/+$/, "");
  await mutate((key: unknown) => {
    if (typeof key !== "string" || !key.startsWith("/api/tob/")) return false;
    if (ticketMutation) return key === "/api/tob/dashboard" || key.startsWith("/api/tob/tickets");
    if (productMutation) return key === "/api/tob/dashboard" || key.startsWith("/api/tob/admin/products") || key.startsWith("/api/tob/meta/products");
    return key === prefix || key.startsWith(`${prefix}?`);
  }, undefined, { revalidate: true });
}

type RefreshMutator = (
  matcher: (key?: unknown) => boolean,
  data: undefined,
  options: { revalidate: true },
) => Promise<unknown>;
