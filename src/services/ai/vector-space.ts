import { getEnv } from "@/lib/db";

/** Vectorize indexes have immutable dimensions; discover the bound index. */
export async function getVectorDimensions(): Promise<number> {
  // Wrangler still generates the beta binding type; deployments may expose
  // either the beta config wrapper or the current flat describe response.
  const info: unknown = await getEnv().VECTORIZE.describe();
  const record = info && typeof info === "object" ? info as Record<string, unknown> : {};
  const config = record.config && typeof record.config === "object"
    ? record.config as Record<string, unknown> : {};
  const dimensions = record.dimensions ?? config.dimensions;
  if (typeof dimensions !== "number" || !Number.isInteger(dimensions) || dimensions < 1 || dimensions > 1536) {
    throw new Error("Unsupported Vectorize index dimensions");
  }
  return dimensions;
}

export async function vectorSpaceKey(input: {
  provider: string;
  model: string;
  baseUrl: string | null;
  dimensions: number;
}): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify([
    "onfire-embedding-v1", input.provider, input.baseUrl?.replace(/\/+$/, "") || null,
    input.model, input.dimensions,
  ]));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("");
}

/** Hash both product and model identity to respect Vectorize's 64-byte limit. */
export async function vectorNamespace(productId: string, space: string): Promise<string> {
  return vectorSpaceKey({ provider: "namespace", model: productId, baseUrl: space, dimensions: 1 });
}
