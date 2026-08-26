import type { Database } from "@/lib/db";
import { getAIProvider } from "./config";
import type { AIRerankResult } from "./providers";

export async function rerank(
  db: Database,
  query: string,
  documents: string[],
  topN?: number,
  context: { tenantId?: string; productId?: string } = {},
): Promise<AIRerankResult | null> {
  const provider = await getAIProvider(db, "rerank", context);
  if (!provider?.rerank) return null;
  return provider.rerank({ query, documents, topN });
}

export function applyRerankOrder<T>(
  rows: readonly T[],
  result: AIRerankResult | null,
  limit: number,
): T[] {
  if (!result || result.results.length === 0) return rows.slice(0, limit);
  const seen = new Set<number>();
  const ranked = result.results
    .map((item) => {
      if (!Number.isInteger(item.index) || item.index < 0 || item.index >= rows.length || seen.has(item.index)) {
        return null;
      }
      seen.add(item.index);
      return rows[item.index];
    })
    .filter((row): row is T => row !== null)
    .slice(0, limit);
  if (ranked.length === 0) return rows.slice(0, limit);
  return ranked.concat(rows.filter((_, index) => !seen.has(index))).slice(0, limit);
}
