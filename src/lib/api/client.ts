"use client";

/**
 * Typed fetch wrapper for the OnFire API envelope ({ ok, data } | { ok, error }).
 * Throws ApiClientError on failures so SWR/mutation callers handle one shape.
 */

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

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
  const res = await fetch(url, {
    credentials: "include",
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...rest.headers,
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });

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

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, json?: unknown) =>
    request<T>(url, { method: "POST", json }),
  patch: <T>(url: string, json?: unknown) =>
    request<T>(url, { method: "PATCH", json }),
  delete: <T>(url: string) => request<T>(url, { method: "DELETE" }),
};

/** Default SWR fetcher bound to the API envelope. */
export const swrFetcher = <T>(url: string) => api.get<T>(url);

/** Build a query string, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    sp.set(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
