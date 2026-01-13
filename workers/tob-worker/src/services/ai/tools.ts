/**
 * AI Agent Tools
 * Tools available to the AI agent for interacting with the ticket system
 */

import { tool } from 'ai';
import { z } from 'zod';
import { eq, and, gte, lte, sql, desc, count, type SQL } from 'drizzle-orm';
import type { Db } from '@onfire/shared/drizzle/client';
import { tickets, replies, productKnowledge, ticketTags } from '@onfire/shared/drizzle/schema';
import { TicketStatus, TicketPriority } from '@onfire/shared';

export interface ToolContext {
  db: Db;
  userId: string;
  tenantIds: string[];
}

/**
 * Get all available tools for the AI agent
 * Tools are created as closures to capture the context
 */
export function getAgentTools(context: ToolContext) {
  // Define parameter schemas
  const queryTicketsSchema = z.object({
    status: z.enum(['new', 'processing', 'replied', 'escalated', 'closed']).optional().describe('Filter by ticket status'),
    priority: z.enum(['high', 'medium', 'low']).optional().describe('Filter by priority'),
    productId: z.string().optional().describe('Filter by product ID'),
    teamId: z.string().optional().describe('Filter by team ID'),
    keyword: z.string().optional().describe('Search keyword in subject or content'),
    dateFrom: z.string().optional().describe('Filter tickets created after this date (ISO format)'),
    dateTo: z.string().optional().describe('Filter tickets created before this date (ISO format)'),
    limit: z.number().min(1).max(50).default(10).describe('Maximum number of tickets to return')
  });

  const getTicketDetailsSchema = z.object({
    ticketId: z.string().describe('The ID of the ticket to retrieve')
  });

  const generateReplyDraftSchema = z.object({
    ticketId: z.string().describe('The ID of the ticket to reply to'),
    tone: z.enum(['formal', 'friendly', 'apologetic', 'neutral']).default('neutral').describe('The tone of the reply'),
    includeKnowledge: z.boolean().default(true).describe('Whether to use product knowledge base for context')
  });

  const getTicketStatisticsSchema = z.object({
    timeRange: z.enum(['today', 'week', 'month', 'all']).default('week').describe('Time range for statistics'),
    productId: z.string().optional().describe('Filter by product ID'),
    teamId: z.string().optional().describe('Filter by team ID')
  });

  const analyzeTicketTrendsSchema = z.object({
    days: z.number().min(1).max(90).default(7).describe('Number of days to analyze'),
    productId: z.string().optional().describe('Filter by product ID')
  });

  /**
   * Query tickets with filters
   */
  const queryTickets = tool({
    description: 'Search and query tickets with various filters. Returns a list of matching tickets.',
    inputSchema: queryTicketsSchema,
    execute: async (params: z.infer<typeof queryTicketsSchema>) => {
      const conditions: SQL[] = [];

      if (params.status) {
        conditions.push(eq(tickets.status, params.status as TicketStatus));
      }
      if (params.priority) {
        conditions.push(eq(tickets.priority, params.priority as TicketPriority));
      }
      if (params.productId) {
        conditions.push(eq(tickets.productId, params.productId));
      }
      if (params.teamId) {
        conditions.push(eq(tickets.teamId, params.teamId));
      }
      if (params.dateFrom) {
        conditions.push(gte(tickets.createdAt, params.dateFrom));
      }
      if (params.dateTo) {
        conditions.push(lte(tickets.createdAt, params.dateTo));
      }

      let query = context.db
        .select({
          id: tickets.id,
          subject: tickets.subject,
          status: tickets.status,
          priority: tickets.priority,
          productId: tickets.productId,
          teamId: tickets.teamId,
          customerEmail: tickets.customerEmail,
          createdAt: tickets.createdAt,
          assigneeId: tickets.assigneeId
        })
        .from(tickets);

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const results = await query
        .orderBy(desc(tickets.createdAt))
        .limit(params.limit)
        .all();

      // If keyword provided, filter in memory (for simplicity)
      let filtered = results;
      if (params.keyword) {
        const kw = params.keyword.toLowerCase();
        filtered = results.filter(
          (t) =>
            t.subject?.toLowerCase().includes(kw)
        );
      }

      return {
        tickets: filtered,
        count: filtered.length,
        hasMore: results.length === params.limit
      };
    }
  });

  /**
   * Get detailed ticket information
   */
  const getTicketDetails = tool({
    description: 'Get detailed information about a specific ticket, including its content, replies, and metadata.',
    inputSchema: getTicketDetailsSchema,
    execute: async (params: z.infer<typeof getTicketDetailsSchema>) => {
      const ticket = await context.db
        .select()
        .from(tickets)
        .where(eq(tickets.id, params.ticketId))
        .get();

      if (!ticket) {
        return { error: 'Ticket not found' };
      }

      const ticketReplies = await context.db
        .select()
        .from(replies)
        .where(eq(replies.ticketId, params.ticketId))
        .orderBy(desc(replies.createdAt))
        .all();

      const tags = await context.db
        .select()
        .from(ticketTags)
        .where(eq(ticketTags.ticketId, params.ticketId))
        .all();

      return {
        ticket: {
          ...ticket,
          metadata: ticket.metadata ? JSON.parse(ticket.metadata) : null,
          aiScreeningResult: ticket.aiScreeningResult ? JSON.parse(ticket.aiScreeningResult) : null,
          aiExtractedIssues: ticket.aiExtractedIssues ? JSON.parse(ticket.aiExtractedIssues) : [],
          aiKeywords: ticket.aiKeywords ? JSON.parse(ticket.aiKeywords) : []
        },
        replies: ticketReplies.map(r => ({
          id: r.id,
          content: r.content,
          senderId: r.senderId,
          senderEmail: r.senderEmail,
          internal: r.internal,
          createdAt: r.createdAt
        })),
        tags: tags.map(t => t.tag)
      };
    }
  });

  /**
   * Generate a reply draft (does not send)
   */
  const generateReplyDraft = tool({
    description: 'Generate a draft reply for a ticket based on its content and knowledge base. The draft needs user confirmation before sending.',
    inputSchema: generateReplyDraftSchema,
    execute: async (params: z.infer<typeof generateReplyDraftSchema>) => {
      const ticket = await context.db
        .select()
        .from(tickets)
        .where(eq(tickets.id, params.ticketId))
        .get();

      if (!ticket) {
        return { error: 'Ticket not found' };
      }

      // If there's already an AI suggested reply, return it
      if (ticket.aiSuggestedReply) {
        return {
          ticketId: params.ticketId,
          draft: ticket.aiSuggestedReply,
          source: 'cached',
          note: 'This is a cached AI-generated reply. User confirmation required before sending.'
        };
      }

      // Get knowledge base for context
      let knowledgeContext = '';
      if (params.includeKnowledge) {
        const knowledge = await context.db
          .select()
          .from(productKnowledge)
          .where(eq(productKnowledge.productId, ticket.productId))
          .limit(10)
          .all();

        knowledgeContext = knowledge
          .map(k => `[${k.knowledgeType}] ${k.title}: ${k.content}`)
          .join('\n\n');
      }

      return {
        ticketId: params.ticketId,
        subject: ticket.subject,
        content: ticket.content,
        tone: params.tone,
        knowledgeContext: knowledgeContext || 'No knowledge base available',
        note: 'Use the prereply AI endpoint to generate the actual draft, then confirm with user before sending.'
      };
    }
  });

  /**
   * Get ticket statistics
   */
  const getTicketStatistics = tool({
    description: 'Get statistics about tickets, such as counts by status, priority, or time period.',
    inputSchema: getTicketStatisticsSchema,
    execute: async (params: z.infer<typeof getTicketStatisticsSchema>) => {
      const now = new Date();
      let dateFrom: string | undefined;

      switch (params.timeRange) {
        case 'today':
          dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
          break;
        case 'week':
          dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
          break;
        case 'month':
          dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
          break;
      }

      const conditions: SQL[] = [];
      if (dateFrom) {
        conditions.push(gte(tickets.createdAt, dateFrom));
      }
      if (params.productId) {
        conditions.push(eq(tickets.productId, params.productId));
      }
      if (params.teamId) {
        conditions.push(eq(tickets.teamId, params.teamId));
      }

      // Get counts by status
      const statusCounts = await context.db
        .select({
          status: tickets.status,
          count: count()
        })
        .from(tickets)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .groupBy(tickets.status)
        .all();

      // Get counts by priority
      const priorityCounts = await context.db
        .select({
          priority: tickets.priority,
          count: count()
        })
        .from(tickets)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .groupBy(tickets.priority)
        .all();

      // Get total count
      const total = statusCounts.reduce((sum, s) => sum + Number(s.count), 0);

      // Get SLA breaches
      const breached = await context.db
        .select({
          count: count()
        })
        .from(tickets)
        .where(
          and(
            ...(conditions.length > 0 ? conditions : []),
            sql`(${tickets.slaAcceptBreached} = 1 OR ${tickets.slaReplyBreached} = 1)`
          )
        )
        .get();

      return {
        timeRange: params.timeRange,
        total,
        byStatus: Object.fromEntries(statusCounts.map(s => [s.status, Number(s.count)])),
        byPriority: Object.fromEntries(priorityCounts.map(p => [p.priority, Number(p.count)])),
        slaBreached: Number(breached?.count ?? 0)
      };
    }
  });

  /**
   * Analyze ticket trends
   */
  const analyzeTicketTrends = tool({
    description: 'Analyze recent ticket trends, including common issues, frequently used tags, and volume patterns.',
    inputSchema: analyzeTicketTrendsSchema,
    execute: async (params: z.infer<typeof analyzeTicketTrendsSchema>) => {
      const dateFrom = new Date(Date.now() - params.days * 24 * 60 * 60 * 1000).toISOString();

      const conditions: SQL[] = [gte(tickets.createdAt, dateFrom)];
      if (params.productId) {
        conditions.push(eq(tickets.productId, params.productId));
      }

      // Get recent tickets with keywords
      const recentTickets = await context.db
        .select({
          id: tickets.id,
          aiKeywords: tickets.aiKeywords,
          aiExtractedIssues: tickets.aiExtractedIssues,
          createdAt: tickets.createdAt
        })
        .from(tickets)
        .where(and(...conditions))
        .orderBy(desc(tickets.createdAt))
        .limit(100)
        .all();

      // Aggregate keywords
      const keywordCounts = new Map<string, number>();
      const issueCounts = new Map<string, number>();

      for (const t of recentTickets) {
        if (t.aiKeywords) {
          try {
            const keywords = JSON.parse(t.aiKeywords) as string[];
            keywords.forEach(kw => {
              keywordCounts.set(kw, (keywordCounts.get(kw) || 0) + 1);
            });
          } catch {
            // ignore parse errors
          }
        }
        if (t.aiExtractedIssues) {
          try {
            const issues = JSON.parse(t.aiExtractedIssues) as string[];
            issues.forEach(issue => {
              issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1);
            });
          } catch {
            // ignore parse errors
          }
        }
      }

      // Get top tags
      const tagResults = await context.db
        .select({
          tag: ticketTags.tag,
          count: count()
        })
        .from(ticketTags)
        .innerJoin(tickets, eq(ticketTags.ticketId, tickets.id))
        .where(and(...conditions))
        .groupBy(ticketTags.tag)
        .orderBy(desc(count()))
        .limit(10)
        .all();

      // Sort by count and get top items
      const topKeywords = Array.from(keywordCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([keyword, cnt]) => ({ keyword, count: cnt }));

      const topIssues = Array.from(issueCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([issue, cnt]) => ({ issue, count: cnt }));

      return {
        period: `Last ${params.days} days`,
        ticketsAnalyzed: recentTickets.length,
        topKeywords,
        topIssues,
        topTags: tagResults.map(t => ({ tag: t.tag, count: Number(t.count) })),
        insight: topIssues.length > 0
          ? `Most common issues: ${topIssues.slice(0, 3).map(i => i.issue).join(', ')}`
          : 'No AI-analyzed issues available yet'
      };
    }
  });

  return {
    queryTickets,
    getTicketDetails,
    generateReplyDraft,
    getTicketStatistics,
    analyzeTicketTrends
  };
}
