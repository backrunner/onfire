import type { Database } from "@/lib/db";
import { getEnv } from "@/lib/db";
import { productKnowledge, tickets } from "@/drizzle/schema";
import { and, eq, inArray } from "drizzle-orm";
import { EMBEDDING_DIMENSIONS } from "@/lib/ai-config";
import { getAIProvider } from "./config";

export async function generateEmbedding(
  db: Database,
  text: string,
  inputType: "document" | "query" = "document"
): Promise<number[] | null> {
  const provider = await getAIProvider(db, "embedding");
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
    `${knowledge.title}\n\n${knowledge.content}`
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
    `${ticket.subject}\n\n${ticket.content}`
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
  const embedding = await generateEmbedding(db, query, "query");
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
  let matches: Array<{ id: string; score: number; type: string }> = [];
  try {
    matches = await searchSimilar(db, query, {
      productId,
      type: "knowledge",
      limit,
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
    if (ranked.length > 0) return ranked;
  }

  return db
    .select()
    .from(productKnowledge)
    .where(eq(productKnowledge.productId, productId))
    .limit(limit);
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
