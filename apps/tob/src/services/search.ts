/**
 * Search Service
 * Semantic search using Cloudflare Vectorize and traditional filters
 */

import { eq, and, gte, lte, like, or, desc, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@onfire/shared/drizzle/client';
import type { VectorizeIndex } from '@cloudflare/workers-types';
import { tickets, ticketTags } from '@onfire/shared/drizzle/schema';
import { TicketStatus, TicketPriority } from '@onfire/shared';
import { getAIConfig } from './ai/screening';
import { createAIClient } from './ai/providers';

export interface SearchParams {
  q: string;
  semantic?: boolean;
  status?: string;
  priority?: string;
  teamId?: string;
  productId?: string;
  dateFrom?: string;
  dateTo?: string;
  tags?: string[];
  excludeTags?: string[];
  keywords?: string[];
  page?: number;
  pageSize?: number;
}

export interface SearchResult {
  id: string;
  subject: string;
  content: string;
  status: string;
  priority: string;
  productId: string;
  teamId: string;
  customerEmail: string;
  createdAt: string;
  score?: number;
  matchType: 'semantic' | 'keyword' | 'filter';
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  searchType: 'semantic' | 'keyword' | 'hybrid';
}

/**
 * Generate embedding for a text using the configured embedding model
 */
export async function generateEmbedding(
  db: Db,
  text: string
): Promise<number[] | null> {
  const config = await getAIConfig(db, 'embedding');
  if (!config) {
    console.log('No embedding AI config found');
    return null;
  }

  try {
    const client = createAIClient(config);
    // Use OpenAI-compatible embedding endpoint
    const response = await fetch(
      config.baseUrl ? `${config.baseUrl}/embeddings` : 'https://api.openai.com/v1/embeddings',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          input: text.slice(0, 8000) // Limit input length
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = (await response.json()) as { data: { embedding: number[] }[] };
    return data.data[0]?.embedding || null;
  } catch (error) {
    console.error('Failed to generate embedding:', error);
    return null;
  }
}

/**
 * Index a ticket in Vectorize
 */
export async function indexTicket(
  db: Db,
  vectorize: VectorizeIndex | undefined,
  ticketId: string
): Promise<boolean> {
  if (!vectorize) {
    console.log('Vectorize not configured');
    return false;
  }

  const ticket = await db
    .select()
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .get();

  if (!ticket) {
    return false;
  }

  // Generate text for embedding
  const textToEmbed = `${ticket.subject}\n\n${ticket.content}`;
  const embedding = await generateEmbedding(db, textToEmbed);

  if (!embedding) {
    return false;
  }

  try {
    // Upsert vector to Vectorize
    await vectorize.upsert([
      {
        id: ticketId,
        values: embedding,
        metadata: {
          productId: ticket.productId,
          teamId: ticket.teamId,
          status: ticket.status,
          priority: ticket.priority,
          createdAt: ticket.createdAt
        }
      }
    ]);

    // Update ticket with vectorize ID
    await db
      .update(tickets)
      .set({ vectorizeId: ticketId })
      .where(eq(tickets.id, ticketId));

    return true;
  } catch (error) {
    console.error('Failed to index ticket:', error);
    return false;
  }
}

/**
 * Search tickets using semantic search and/or filters
 */
export async function searchTickets(
  db: Db,
  vectorize: VectorizeIndex | undefined,
  params: SearchParams
): Promise<SearchResponse> {
  const page = params.page || 1;
  const pageSize = Math.min(params.pageSize || 20, 100);
  const offset = (page - 1) * pageSize;

  let semanticIds: string[] = [];
  let semanticScores: Map<string, number> = new Map();

  // Perform semantic search if enabled and Vectorize is available
  if (params.semantic && params.q && vectorize) {
    const embedding = await generateEmbedding(db, params.q);

    if (embedding) {
      try {
        const vectorResults = await vectorize.query(embedding, {
          topK: 50,
          filter: buildVectorizeFilter(params)
        });

        semanticIds = vectorResults.matches.map((m) => m.id);
        vectorResults.matches.forEach((m) => {
          semanticScores.set(m.id, m.score);
        });
      } catch (error) {
        console.error('Vectorize search failed:', error);
      }
    }
  }

  // Build SQL conditions for traditional search
  const conditions: SQL[] = [];

  if (params.status) {
    conditions.push(eq(tickets.status, params.status as TicketStatus));
  }
  if (params.priority) {
    conditions.push(eq(tickets.priority, params.priority as TicketPriority));
  }
  if (params.teamId) {
    conditions.push(eq(tickets.teamId, params.teamId));
  }
  if (params.productId) {
    conditions.push(eq(tickets.productId, params.productId));
  }
  if (params.dateFrom) {
    conditions.push(gte(tickets.createdAt, params.dateFrom));
  }
  if (params.dateTo) {
    conditions.push(lte(tickets.createdAt, params.dateTo));
  }

  // Keyword search in subject and content
  if (params.q && !params.semantic) {
    const keyword = `%${params.q}%`;
    const keywordCondition = or(
      like(tickets.subject, keyword),
      like(tickets.content, keyword)
    );
    if (keywordCondition) {
      conditions.push(keywordCondition);
    }
  }

  // Execute query
  let query = db
    .select({
      id: tickets.id,
      subject: tickets.subject,
      content: tickets.content,
      status: tickets.status,
      priority: tickets.priority,
      productId: tickets.productId,
      teamId: tickets.teamId,
      customerEmail: tickets.customerEmail,
      createdAt: tickets.createdAt
    })
    .from(tickets);

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  let results = await query
    .orderBy(desc(tickets.createdAt))
    .limit(pageSize + 1) // Get one extra to check hasMore
    .offset(offset)
    .all();

  // If semantic search was performed, prioritize those results
  if (semanticIds.length > 0) {
    // Get semantic results that match filters
    const semanticResults = results.filter((r) => semanticIds.includes(r.id));
    const otherResults = results.filter((r) => !semanticIds.includes(r.id));

    // Sort semantic results by score
    semanticResults.sort((a, b) => {
      const scoreA = semanticScores.get(a.id) || 0;
      const scoreB = semanticScores.get(b.id) || 0;
      return scoreB - scoreA;
    });

    results = [...semanticResults, ...otherResults];
  }

  // Apply tag filters if specified
  if (params.tags && params.tags.length > 0) {
    const ticketIdsWithTags = await db
      .selectDistinct({ ticketId: ticketTags.ticketId })
      .from(ticketTags)
      .where(
        and(
          sql`${ticketTags.tag} IN (${params.tags.map((t) => `'${t}'`).join(', ')})`,
          sql`${ticketTags.ticketId} IN (${results.map((r) => `'${r.id}'`).join(', ')})`
        )
      )
      .all();

    const idsWithTags = new Set(ticketIdsWithTags.map((r) => r.ticketId));
    results = results.filter((r) => idsWithTags.has(r.id));
  }

  if (params.excludeTags && params.excludeTags.length > 0) {
    const ticketIdsWithExcludedTags = await db
      .selectDistinct({ ticketId: ticketTags.ticketId })
      .from(ticketTags)
      .where(
        and(
          sql`${ticketTags.tag} IN (${params.excludeTags.map((t) => `'${t}'`).join(', ')})`,
          sql`${ticketTags.ticketId} IN (${results.map((r) => `'${r.id}'`).join(', ')})`
        )
      )
      .all();

    const idsToExclude = new Set(ticketIdsWithExcludedTags.map((r) => r.ticketId));
    results = results.filter((r) => !idsToExclude.has(r.id));
  }

  const hasMore = results.length > pageSize;
  const finalResults = results.slice(0, pageSize);

  return {
    results: finalResults.map((r) => ({
      ...r,
      score: semanticScores.get(r.id),
      matchType: semanticScores.has(r.id) ? 'semantic' : params.q ? 'keyword' : 'filter'
    })),
    total: finalResults.length, // Note: For accurate total, a separate count query would be needed
    page,
    pageSize,
    hasMore,
    searchType: params.semantic && semanticIds.length > 0 ? 'semantic' : params.q ? 'keyword' : 'hybrid'
  };
}

/**
 * Build Vectorize filter from search params
 */
function buildVectorizeFilter(params: SearchParams): Record<string, any> | undefined {
  const filter: Record<string, any> = {};

  if (params.productId) {
    filter.productId = params.productId;
  }
  if (params.teamId) {
    filter.teamId = params.teamId;
  }
  if (params.status) {
    filter.status = params.status;
  }
  if (params.priority) {
    filter.priority = params.priority;
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
}

/**
 * Get search suggestions based on recent searches and popular keywords
 */
export async function getSearchSuggestions(
  db: Db,
  prefix: string
): Promise<string[]> {
  if (!prefix || prefix.length < 2) {
    return [];
  }

  // Get popular keywords from AI-extracted keywords
  const keywordResults = await db
    .select({ keywords: tickets.aiKeywords })
    .from(tickets)
    .where(sql`${tickets.aiKeywords} IS NOT NULL`)
    .limit(100)
    .all();

  const keywordCounts = new Map<string, number>();
  const prefixLower = prefix.toLowerCase();

  for (const row of keywordResults) {
    if (row.keywords) {
      try {
        const keywords = JSON.parse(row.keywords) as string[];
        for (const kw of keywords) {
          if (kw.toLowerCase().includes(prefixLower)) {
            keywordCounts.set(kw, (keywordCounts.get(kw) || 0) + 1);
          }
        }
      } catch {}
    }
  }

  // Sort by frequency and return top suggestions
  return Array.from(keywordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([keyword]) => keyword);
}
