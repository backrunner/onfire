/**
 * AI Embedding Service
 * Generates and manages vector embeddings for semantic search
 */

import type { Database } from "@/lib/db";
import { productKnowledge, productDocuments, tickets } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { getAIProvider } from "./config";

export interface EmbeddingResult {
  id: string;
  embedding: number[];
}

export async function generateEmbedding(
  db: Database,
  text: string
): Promise<number[] | null> {
  const provider = await getAIProvider(db, "embedding");
  if (!provider) {
    console.log("Embedding AI not configured");
    return null;
  }

  try {
    const result = await provider.embed(text);
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

  if (!knowledge) {
    throw new Error(`Knowledge not found: ${knowledgeId}`);
  }

  const textToEmbed = `${knowledge.title}\n\n${knowledge.content}`;
  const embedding = await generateEmbedding(db, textToEmbed);

  if (!embedding) {
    return false;
  }

  // In a real implementation, you would store this in Cloudflare Vectorize
  // For now, we'll store a reference ID
  const vectorizeId = `knowledge-${knowledgeId}-${Date.now()}`;

  await db
    .update(productKnowledge)
    .set({
      vectorizeIds: JSON.stringify([vectorizeId]),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(productKnowledge.id, knowledgeId));

  console.log(`Embedded knowledge ${knowledgeId} with vectorize ID: ${vectorizeId}`);
  return true;
}

export async function embedTicket(
  db: Database,
  ticketId: string
): Promise<boolean> {
  const ticket = await db.query.tickets.findFirst({
    where: eq(tickets.id, ticketId),
  });

  if (!ticket) {
    throw new Error(`Ticket not found: ${ticketId}`);
  }

  const textToEmbed = `${ticket.subject}\n\n${ticket.content}`;
  const embedding = await generateEmbedding(db, textToEmbed);

  if (!embedding) {
    return false;
  }

  // Store vectorize reference
  const vectorizeId = `ticket-${ticketId}-${Date.now()}`;

  await db
    .update(tickets)
    .set({
      vectorizeId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(tickets.id, ticketId));

  console.log(`Embedded ticket ${ticketId} with vectorize ID: ${vectorizeId}`);
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
  const embedding = await generateEmbedding(db, query);

  if (!embedding) {
    return [];
  }

  // In a real implementation, you would query Cloudflare Vectorize here
  // This is a placeholder that returns empty results
  console.log("Semantic search not fully implemented - requires Vectorize integration");

  return [];
}

export async function batchEmbedKnowledge(
  db: Database,
  productId: string
): Promise<{ success: number; failed: number }> {
  const knowledgeItems = await db
    .select()
    .from(productKnowledge)
    .where(eq(productKnowledge.productId, productId));

  let success = 0;
  let failed = 0;

  for (const item of knowledgeItems) {
    try {
      const result = await embedKnowledge(db, item.id);
      if (result) {
        success++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`Failed to embed knowledge ${item.id}:`, error);
      failed++;
    }
  }

  return { success, failed };
}
