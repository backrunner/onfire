"use client";

/**
 * ToC API client: same envelope contract as `api` (see ./client), plus
 * - Authorization header from the sessionStorage-held customer JWT
 * - global session-expiry signalling on 401 responses
 */

import { ApiClientError } from "./client";
import { notifyTocSessionExpired, readTocCredentials } from "@/lib/toc-session";

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
  details?: unknown;
}

async function request<T>(
  url: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const { json, ...rest } = init ?? {};
  const token = readTocCredentials()?.token;

  const res = await fetch(url, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...rest.headers,
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });

  if (res.status === 401) {
    notifyTocSessionExpired();
    throw new ApiClientError("Session expired", 401);
  }

  let envelope: Envelope<T>;
  try {
    envelope = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiClientError(`Request failed (${res.status})`, res.status);
  }

  if (!res.ok || !envelope.ok) {
    throw new ApiClientError(
      envelope.error ?? `Request failed (${res.status})`,
      res.status,
      envelope.details
    );
  }
  return envelope.data as T;
}

export const tocApi = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, json?: unknown) =>
    request<T>(url, { method: "POST", json }),
};

export { ApiClientError };
