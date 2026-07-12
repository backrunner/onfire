"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type TocCredentials,
  TOC_SESSION_EXPIRED_EVENT,
  type TocSessionExpiredDetail,
  clearTocCredentials,
  readTocCredentials,
  writeTocCredentials,
} from "@/lib/toc-session";
import { tocPath } from "@/lib/toc-path";

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
  /** True when a product-issued remote identity credential was rejected. */
  isIdentityError: boolean;
  /** Product identifier retained after expiry so the return destination can load. */
  productId: string | null;
  missingFields: TocMissingField[];
  clear: () => void;
}

interface CredentialState {
  loading: boolean;
  credentials: TocCredentials | null;
  expired: boolean;
  identityError: boolean;
  productId: string | null;
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
    identityError: false,
    productId: null,
    missingFields: [],
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
    const token = fragment.get("token") ?? url.searchParams.get("token");
    const productId = url.searchParams.get("productId");
    const legacyCredential = url.searchParams.get("credential");
    // Remote identity credentials are fragment-only so they never enter the
    // initial HTTP request, proxy logs, browser history, or Referer headers.
    const credential = fragment.get("credential");

    if (
      token !== null ||
      productId !== null ||
      credential !== null ||
      legacyCredential !== null
    ) {
      if (token && productId) {
        writeTocCredentials({ token, productId });
      } else {
        // Never carry a previous product's session across a partial or
        // malformed bootstrap URL. Complete links always provide both
        // productId and token (or the fragment credential for exchange).
        clearTocCredentials();
      }
      url.searchParams.delete("token");
      url.searchParams.delete("productId");
      url.searchParams.delete("credential");
      fragment.delete("token");
      fragment.delete("credential");
      url.hash = fragment.toString() ? `#${fragment.toString()}` : "";
      window.history.replaceState(
        window.history.state,
        "",
        url.pathname + url.search + url.hash
      );
    }

    let cancelled = false;
    const finish = (identityError = false) => {
      if (cancelled) return;
      const stored = readTocCredentials();
      const missingFields: TocMissingField[] = [];
      if (!stored) {
        if (token && !productId) missingFields.push("productId");
        else if (productId && !token && !credential) missingFields.push("token");
        else missingFields.push("productId", "token");
      }
      setState({
        loading: false,
        credentials: stored,
        expired: false,
        identityError,
        productId: stored?.productId ?? productId,
        missingFields,
      });
    };

    if (credential && productId && !token) {
      void fetch(tocPath("/api/toc/identity/exchange"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ productId, credential }),
      })
        .then(async (response) => {
          const body = (await response.json()) as {
            ok?: boolean;
            data?: { token?: string; productId?: string };
          };
          if (!response.ok || !body.ok || !body.data?.token) {
            throw new Error("Identity exchange failed");
          }
          writeTocCredentials({
            token: body.data.token,
            productId: body.data.productId ?? productId,
          });
        })
        .then(() => finish(false))
        .catch(() => finish(true));
    } else {
      finish(false);
    }

    const onExpired = (event: Event) => {
      const detail = (event as CustomEvent<TocSessionExpiredDetail>).detail;
      setState({
        loading: false,
        credentials: null,
        expired: true,
        identityError: false,
        productId: detail?.productId ?? null,
        missingFields: ["productId", "token"],
      });
    };
    window.addEventListener(TOC_SESSION_EXPIRED_EVENT, onExpired);
    return () => {
      cancelled = true;
      window.removeEventListener(TOC_SESSION_EXPIRED_EVENT, onExpired);
    };
  }, []);

  const clear = useCallback(() => {
    clearTocCredentials();
    setState({
      loading: false,
      credentials: null,
      expired: false,
      identityError: false,
      productId: null,
      missingFields: ["productId", "token"],
    });
  }, []);

  return {
    credentials: state.credentials,
    isLoading: state.loading,
    isValid: state.credentials !== null,
    isExpired: state.expired,
    isIdentityError: state.identityError,
    productId: state.productId,
    missingFields: state.missingFields,
    clear,
  };
}
