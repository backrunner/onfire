"use client";

/**
 * ToC portal session storage.
 *
 * Credentials (customer JWT + productId) arrive once via URL query params,
 * are persisted to sessionStorage, and the params are immediately stripped
 * from the URL so the token never lingers in the address bar, browser
 * history, or referrer headers.
 */

const STORAGE_KEY = "onfire-toc-credentials";

/** Window event fired when an API call returns 401 (token expired/revoked). */
export const TOC_SESSION_EXPIRED_EVENT = "onfire-toc-session-expired";

export interface TocCredentials {
  token: string;
  productId: string;
}

export function readTocCredentials(): TocCredentials | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TocCredentials>;
    if (typeof parsed.token === "string" && typeof parsed.productId === "string") {
      return { token: parsed.token, productId: parsed.productId };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeTocCredentials(credentials: TocCredentials): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
  } catch {
    // sessionStorage unavailable (private mode quota etc.) — degrade silently
  }
}

export function clearTocCredentials(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Clear stored credentials and notify all mounted ToC views that the
 * session is no longer valid (used by the API client on 401 responses).
 */
export function notifyTocSessionExpired(): void {
  if (typeof window === "undefined") return;
  clearTocCredentials();
  window.dispatchEvent(new Event(TOC_SESSION_EXPIRED_EVENT));
}
