"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type TocCredentials,
  TOC_SESSION_EXPIRED_EVENT,
  clearTocCredentials,
  readTocCredentials,
  writeTocCredentials,
} from "@/lib/toc-session";

export type { TocCredentials };

export type TocMissingField = "productId" | "token";

export interface TocCredentialsResult {
  /** Stored credentials, or null while loading / when absent. */
  credentials: TocCredentials | null;
  /** True until the URL/sessionStorage has been inspected on the client. */
  isLoading: boolean;
  isValid: boolean;
  /** True when an API call hit a 401 and the session was discarded. */
  isExpired: boolean;
  missingFields: TocMissingField[];
  clear: () => void;
}

interface CredentialState {
  loading: boolean;
  credentials: TocCredentials | null;
  expired: boolean;
  missingFields: TocMissingField[];
}

/**
 * ToC portal credentials.
 *
 * On first load, `?token=...&productId=...` (if present) is persisted to
 * sessionStorage and immediately stripped from the URL via
 * history.replaceState so the token never stays in the address bar or
 * browser history. All subsequent reads come from sessionStorage, which
 * also makes in-app navigation (ticket detail pages) work without
 * re-passing the token.
 */
export function useTocCredentials(): TocCredentialsResult {
  const [state, setState] = useState<CredentialState>({
    loading: true,
    credentials: null,
    expired: false,
    missingFields: [],
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token");
    const productId = url.searchParams.get("productId");

    if (token !== null || productId !== null) {
      if (token && productId) {
        writeTocCredentials({ token, productId });
      }
      url.searchParams.delete("token");
      url.searchParams.delete("productId");
      window.history.replaceState(
        window.history.state,
        "",
        url.pathname + url.search + url.hash
      );
    }

    const stored = readTocCredentials();
    const missingFields: TocMissingField[] = [];
    if (!stored) {
      // Report what the (partial) URL actually lacked when possible.
      if (token && !productId) missingFields.push("productId");
      else if (productId && !token) missingFields.push("token");
      else missingFields.push("productId", "token");
    }

    setState({
      loading: false,
      credentials: stored,
      expired: false,
      missingFields,
    });

    const onExpired = () =>
      setState({
        loading: false,
        credentials: null,
        expired: true,
        missingFields: ["productId", "token"],
      });
    window.addEventListener(TOC_SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(TOC_SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const clear = useCallback(() => {
    clearTocCredentials();
    setState({
      loading: false,
      credentials: null,
      expired: false,
      missingFields: ["productId", "token"],
    });
  }, []);

  return {
    credentials: state.credentials,
    isLoading: state.loading,
    isValid: state.credentials !== null,
    isExpired: state.expired,
    missingFields: state.missingFields,
    clear,
  };
}
