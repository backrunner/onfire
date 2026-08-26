import type { Database } from "@/lib/db";
import { getEnv } from "@/lib/db";
import { productKnowledge, tickets } from "@/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import { EMBEDDING_DIMENSIONS } from "@/lib/ai-config";
import { getAIProvider } from "./config";
import type { AIRuntimeContext } from "@/lib/ai-scope";
import { applyRerankOrder, rerank } from "./rerank";

export async function generateEmbedding(
  db: Database,
  text: string,
  inputType: "document" | "query" = "document",
  context: AIRuntimeContext = {}
): Promise<number[] | null> {
  const provider = await getAIProvider(db, "embedding", context);
  if (!provider) return null;

  try {
    const result = await provider.embed(text, { inputType });
    if (result.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, received ${result.embedding.length}`
      );
    }
    return result.embedding;
  } catch (error) {
    console.error("Failed to generate embedding:", error);
    return null;
  }
}

export async function embedKnowledge(
  db: Database,
  knowledgeId: string
): Promise<boolean> {
  const knowledge = await db.query.productKnowledge.findFirst({
    where: eq(productKnowledge.id, knowledgeId),
  });
  if (!knowledge) throw new Error(`Knowledge not found: ${knowledgeId}`);

  const embedding = await generateEmbedding(
    db,
    `${knowledge.title}\n\n${knowledge.content}`,
    "document",
    { productId: knowledge.productId }
  );
  if (!embedding) return false;

  const vectorizeId = `knowledge:${knowledgeId}`;
  await getEnv().VECTORIZE.upsert([
    {
      id: vectorizeId,
      values: embedding,
      namespace: `product:${knowledge.productId}`,
      metadata: {
        entityId: knowledgeId,
        productId: knowledge.productId,
        type: "knowledge",
      },
    },
  ]);

  await db
    .update(productKnowledge)
    .set({
      vectorizeIds: JSON.stringify([vectorizeId]),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(productKnowledge.id, knowledgeId));
  return true;
}

export async function embedTicket(
  db: Database,
  ticketId: string
): Promise<boolean> {
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
  });
  if (!ticket) throw new Error(`Ticket not found: ${ticketId}`);

  const embedding = await generateEmbedding(
    db,
    `${ticket.subject}\n\n${ticket.content}`,
    "document",
    { tenantId: ticket.tenantId, productId: ticket.productId }
  );
  if (!embedding) return false;

  const vectorizeId = `ticket:${ticketId}`;
  await getEnv().VECTORIZE.upsert([
    {
      id: vectorizeId,
      values: embedding,
      namespace: `product:${ticket.productId}`,
      metadata: {
        entityId: ticketId,
        productId: ticket.productId,
        type: "ticket",
      },
    },
  ]);

  await db
    .update(tickets)
    .set({ vectorizeId, updatedAt: new Date().toISOString() })
    .where(eq(tickets.id, ticketId));
  return true;
}

export async function searchSimilar(
  db: Database,
  query: string,
  options: {
    productId?: string;
    type?: "knowledge" | "ticket";
    limit?: number;
  } = {}
): Promise<Array<{ id: string; score: number; type: string }>> {
  const embedding = await generateEmbedding(db, query, "query", {
    productId: options.productId,
  });
  if (!embedding) return [];

  const limit = Math.min(Math.max(options.limit ?? 5, 1), 20);
  const result = await getEnv().VECTORIZE.query(embedding, {
    topK: options.type ? Math.min(limit * 3, 20) : limit,
    namespace: options.productId ? `product:${options.productId}` : undefined,
    returnMetadata: "all",
  });

  return result.matches
    .map((match) => {
      const metadata = match.metadata as
        | { entityId?: unknown; type?: unknown }
        | undefined;
      return {
        id:
          typeof metadata?.entityId === "string"
            ? metadata.entityId
            : match.id.replace(/^(knowledge|ticket):/, ""),
        score: match.score,
        type: typeof metadata?.type === "string" ? metadata.type : "unknown",
      };
    })
    .filter((match) => !options.type || match.type === options.type)
    .slice(0, limit);
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
      return rerankKnowledgeRows(db, productId, query, ranked, resultLimit);
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

export async function batchEmbedKnowledge(
  db: Database,
  productId: string
): Promise<{ success: number; failed: number }> {
  const items = await db
    .select({ id: productKnowledge.id })
    .from(productKnowledge)
    .where(eq(productKnowledge.productId, productId));

  let success = 0;
  let failed = 0;
  for (const item of items) {
    try {
      (await embedKnowledge(db, item.id)) ? success++ : failed++;
    } catch (error) {
      console.error(`Failed to embed knowledge ${item.id}:`, error);
      failed++;
    }
  }
  return { success, failed };
}
