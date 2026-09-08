import type { Database } from "@/lib/db";
import { getEnv } from "@/lib/db";
import { productKnowledge } from "@/drizzle/schema";
import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getAIProvider, getEmbeddingProfile } from "./config";
import type { AIRuntimeContext } from "@/lib/ai-scope";
import { applyRerankOrder, rerank } from "./rerank";
import { vectorNamespace } from "./vector-space";

export async function generateEmbedding(
  db: Database,
  text: string,
  inputType: "document" | "query" = "document",
  context: AIRuntimeContext = {}
): Promise<number[] | null> {
  try {
    const provider = await getAIProvider(db, "embedding", context);
    return provider ? (await provider.embed(text, { inputType })).embedding : null;
  } catch (error) {
    console.error("Failed to generate embedding:", error);
    return null;
  }
}

function outdated(space: string) {
  return or(
    isNull(productKnowledge.embeddingSpace),
    sql`${productKnowledge.embeddingSpace} != ${space}`,
    isNull(productKnowledge.embeddingSourceUpdatedAt),
    sql`${productKnowledge.embeddingSourceUpdatedAt} != ${productKnowledge.updatedAt}`,
    isNull(productKnowledge.vectorizeIds),
  );
}

function availableForRebuild() {
  const leaseCutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  return or(isNull(productKnowledge.embeddingLease), lt(productKnowledge.embeddingAttemptedAt, leaseCutoff));
}

/** CAS lease protects concurrent edits, deletion, model switches, and cron overlap. */
export async function embedKnowledge(db: Database, knowledgeId: string): Promise<boolean> {
  const knowledge = await db.query.productKnowledge.findFirst({ where: eq(productKnowledge.id, knowledgeId) });
  if (!knowledge) throw new Error(`Knowledge not found: ${knowledgeId}`);
  const provider = await getAIProvider(db, "embedding", { productId: knowledge.productId });
  if (!provider?.embeddingSpace) return false;
  const space = provider.embeddingSpace;
  const lease = crypto.randomUUID();
  const claimed = await db.update(productKnowledge).set({
    embeddingLease: lease, embeddingAttemptedAt: new Date().toISOString(), embeddingError: null,
  }).where(and(
    eq(productKnowledge.id, knowledgeId), eq(productKnowledge.updatedAt, knowledge.updatedAt),
    availableForRebuild(), outdated(space),
  )).returning({ id: productKnowledge.id });
  if (claimed.length === 0) return false;

  // A unique ID per lease prevents a late old worker from overwriting a newer vector.
  const vectorId = `knowledge:${lease}`;
  let uploaded = false;
  try {
    const result = await provider.embed(`${knowledge.title}\n\n${knowledge.content}`, { inputType: "document" });
    const profile = await getEmbeddingProfile(db, { productId: knowledge.productId });
    if (profile?.space !== space) throw new Error("Embedding model changed during rebuild; retrying");
    await getEnv().VECTORIZE.upsert([{
      id: vectorId, values: result.embedding,
      namespace: await vectorNamespace(knowledge.productId, space),
      metadata: { entityId: knowledgeId, productId: knowledge.productId, type: "knowledge", space },
    }]);
    uploaded = true;
    const saved = await db.update(productKnowledge).set({
      vectorizeIds: JSON.stringify([vectorId]), embeddingSpace: space,
      embeddingSourceUpdatedAt: knowledge.updatedAt, embeddingLease: null, embeddingError: null,
    }).where(and(
      eq(productKnowledge.id, knowledgeId), eq(productKnowledge.embeddingLease, lease),
      eq(productKnowledge.updatedAt, knowledge.updatedAt),
    )).returning({ id: productKnowledge.id });
    if (saved.length === 0) throw new Error("Knowledge changed during rebuild; retrying");
    try { await deleteEmbeddings(knowledge.vectorizeIds); }
    catch (error) { console.error("Failed to clean old knowledge vector:", error); }
    return true;
  } catch (error) {
    if (uploaded) {
      try { await getEnv().VECTORIZE.deleteByIds([vectorId]); }
      catch (cleanupError) { console.error("Failed to clean superseded knowledge vector:", cleanupError); }
    }
    await db.update(productKnowledge).set({
      embeddingLease: null,
      embeddingError: error instanceof Error ? error.message.slice(0, 1000) : "Embedding failed",
    }).where(and(eq(productKnowledge.id, knowledgeId), eq(productKnowledge.embeddingLease, lease)));
    return false;
  }
}

export async function searchSimilar(
  db: Database,
  query: string,
  options: { productId?: string; type?: "knowledge" | "ticket"; limit?: number } = {},
): Promise<Array<{ id: string; score: number; type: string }>> {
  // All knowledge reads require an explicit product and a verified coordinate space.
  if (!options.productId) return [];
  const provider = await getAIProvider(db, "embedding", { productId: options.productId });
  if (!provider?.embeddingSpace) return [];
  const result = await provider.embed(query, { inputType: "query" });
  if ((await getEmbeddingProfile(db, { productId: options.productId }))?.space !== provider.embeddingSpace) return [];
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 5) || 5, 1), 20);
  const matches = await getEnv().VECTORIZE.query(result.embedding, {
    topK: Math.min(limit * 3, 20),
    namespace: await vectorNamespace(options.productId, provider.embeddingSpace),
    returnMetadata: "all",
  });
  const candidates = matches.matches.flatMap((match) => {
    const metadata = match.metadata;
    if (metadata?.space !== provider.embeddingSpace || metadata?.productId !== options.productId ||
      typeof metadata?.entityId !== "string" || metadata?.type !== "knowledge") return [];
    return [{ id: metadata.entityId, vectorId: match.id, score: match.score, type: "knowledge" }];
  });
  if (candidates.length === 0 || options.type === "ticket") return [];
  const current = await db.select().from(productKnowledge).where(and(
    eq(productKnowledge.productId, options.productId),
    eq(productKnowledge.embeddingSpace, provider.embeddingSpace),
    sql`${productKnowledge.embeddingSourceUpdatedAt} = ${productKnowledge.updatedAt}`,
    inArray(productKnowledge.id, candidates.map((item) => item.id)),
  ));
  const byId = new Map(current.map((row) => [row.id, row]));
  return candidates.filter((item) => byId.get(item.id)?.vectorizeIds === JSON.stringify([item.vectorId]))
    .slice(0, limit).map(({ id, score, type }) => ({ id, score, type }));
}

/** Effective profile is recomputed, so inherited routes and credential edits rebuild too. */
export async function rebuildKnowledgeEmbeddings(db: Database, productId?: string, limit = 5) {
  const productRows = await db.selectDistinct({ productId: productKnowledge.productId }).from(productKnowledge)
    .where(productId ? eq(productKnowledge.productId, productId) : undefined)
    .groupBy(productKnowledge.productId)
    .orderBy(sql`min(${productKnowledge.embeddingAttemptedAt})`);
  let attempted = 0;
  let completed = 0;
  const retryCutoff = new Date(Date.now() - 60_000).toISOString();
  for (const row of productRows) {
    if (attempted >= limit) break;
    try {
      const profile = await getEmbeddingProfile(db, { productId: row.productId });
      if (!profile) continue;
      const pending = await db.select({ id: productKnowledge.id }).from(productKnowledge).where(and(
        eq(productKnowledge.productId, row.productId), outdated(profile.space), availableForRebuild(),
        or(isNull(productKnowledge.embeddingAttemptedAt), lt(productKnowledge.embeddingAttemptedAt, retryCutoff)),
      )).orderBy(asc(productKnowledge.embeddingAttemptedAt), asc(productKnowledge.id)).limit(limit - attempted);
      for (const item of pending) {
        attempted += 1;
        if (await embedKnowledge(db, item.id)) completed += 1;
      }
    } catch (error) { console.error("Knowledge rebuild failed:", error); }
  }
  return { attempted, completed };
}

export async function knowledgeEmbeddingStatus(db: Database, productId: string) {
  const profile = await getEmbeddingProfile(db, { productId });
  const rows = await db.select({
    total: sql<number>`count(*)`,
    pending: sql<number>`sum(case when ${outdated(profile?.space ?? "disabled")} then 1 else 0 end)`,
    failed: sql<number>`sum(case when ${productKnowledge.embeddingError} is not null then 1 else 0 end)`,
  }).from(productKnowledge).where(eq(productKnowledge.productId, productId));
  return { profile, total: rows[0].total, pending: rows[0].pending ?? 0, failed: rows[0].failed ?? 0 };
}
export async function deleteEmbeddings(
  vectorizeIds: string | null | undefined
): Promise<void> {
  if (!vectorizeIds) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(vectorizeIds);
  } catch {
    parsed = [vectorizeIds];
  }
  if (!Array.isArray(parsed)) return;
  const ids = parsed.filter((id): id is string => typeof id === "string");
  if (ids.length > 0) await getEnv().VECTORIZE.deleteByIds(ids);
}

export async function findRelevantKnowledge(
  db: Database,
  productId: string,
  query: string,
  limit = 5
): Promise<Array<typeof productKnowledge.$inferSelect>> {
  const normalizedLimit = Number.isFinite(limit) ? Math.trunc(limit) : 5;
  const resultLimit = Math.min(Math.max(normalizedLimit, 1), 20);
  const candidateLimit = Math.min(resultLimit * 4, 20);
  let matches: Array<{ id: string; score: number; type: string }> = [];
  try {
    matches = await searchSimilar(db, query, {
      productId,
      type: "knowledge",
      limit: candidateLimit,
    });
  } catch (error) {
    console.error("Vector knowledge search failed:", error);
  }

  if (matches.length > 0) {
    const rows = await db
      .select()
      .from(productKnowledge)
      .where(
        and(
          eq(productKnowledge.productId, productId),
          inArray(productKnowledge.id, matches.map((match) => match.id))
        )
      );
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ranked = matches
      .map((match) => byId.get(match.id))
      .filter((row): row is typeof productKnowledge.$inferSelect => Boolean(row));
    if (ranked.length > 0) {
      // During migration, preserve access to entries that have not been rebuilt.
      let pending: Array<typeof productKnowledge.$inferSelect> = [];
      try {
        const profile = await getEmbeddingProfile(db, { productId });
        if (profile) pending = await db.select().from(productKnowledge).where(and(
          eq(productKnowledge.productId, productId), outdated(profile.space),
        )).limit(candidateLimit);
      } catch (error) {
        // An unavailable describe call must not discard already verified D1
        // results or prevent the assistant from answering.
        console.error("Pending knowledge lookup failed:", error);
      }
      const existing = new Set(ranked.map((row) => row.id));
      return rerankKnowledgeRows(db, productId, query,
        ranked.concat(pending.filter((row) => !existing.has(row.id))).slice(0, 20), resultLimit);
    }
  }

  const fallback = await db
    .select()
    .from(productKnowledge)
    .where(eq(productKnowledge.productId, productId))
    .limit(candidateLimit);
  return rerankKnowledgeRows(db, productId, query, fallback, resultLimit);
}

async function rerankKnowledgeRows(
  db: Database,
  productId: string,
  query: string,
  rows: Array<typeof productKnowledge.$inferSelect>,
  limit: number,
): Promise<Array<typeof productKnowledge.$inferSelect>> {
  if (rows.length <= 1) return rows.slice(0, limit);
  try {
    const result = await rerank(
      db,
      query,
      rows.map((row) => `${row.title}\n\n${row.content}`.slice(0, 8_000)),
      limit,
      { productId },
    );
    return applyRerankOrder(rows, result, limit);
  } catch (error) {
    console.error("Knowledge reranking failed:", error);
    return rows.slice(0, limit);
  }
}
