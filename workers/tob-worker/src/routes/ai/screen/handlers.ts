import { inArray, isNull, eq } from 'drizzle-orm';
import { resolveContext } from '../../../core/context';
import { assertPermission } from '@onfire/shared/rbac';
import { tickets } from '@onfire/shared/drizzle/schema';
import { screenTicket, generatePreReply, batchScreenTickets } from '../../../services/ai/screening';
import type { Bindings } from '../../../core/types';

export const screenSingleTicket = async (env: Bindings, store: any, user: any, ticketId: string) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'ticket.read');

  const result = await screenTicket(store.db, ticketId);
  if (!result) {
    return { success: false, message: 'Screening failed or no AI config available' };
  }
  return { success: true, result };
};

export const generatePreReplyHandler = async (env: Bindings, store: any, user: any, ticketId: string) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'ticket.read');

  const result = await generatePreReply(store.db, ticketId);
  if (!result) {
    return { success: false, message: 'Pre-reply generation failed or no AI config available' };
  }
  return { success: true, result };
};

export const batchScreen = async (env: Bindings, store: any, user: any, body: { ticketIds?: string[]; limit?: number }) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'ticket.read');

  let ticketIds: string[] = body.ticketIds ?? [];
  if (ticketIds.length === 0) {
    const unscreened = await store.db
      .select({ id: tickets.id })
      .from(tickets)
      .where(isNull(tickets.aiScreeningStatus))
      .limit(body.limit || 10)
      .all();
    ticketIds = unscreened.map((t: any) => t.id);
  }

  if (ticketIds.length === 0) {
    return { success: true, message: 'No tickets to screen', processed: 0 };
  }

  await store.db
    .update(tickets)
    .set({ aiScreeningStatus: 'processing' })
    .where(inArray(tickets.id, ticketIds));

  const results = await batchScreenTickets(store.db, ticketIds);
  const succeeded = Array.from(results.values()).filter((r) => r !== null).length;
  const failed = ticketIds.length - succeeded;

  return { success: true, processed: ticketIds.length, succeeded, failed };
};

export const getScreeningResult = async (env: Bindings, store: any, user: any, ticketId: string) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'ticket.read');

  const ticket = await store.db
    .select({
      id: tickets.id,
      aiScreeningStatus: tickets.aiScreeningStatus,
      aiScreeningResult: tickets.aiScreeningResult,
      aiSuggestedReply: tickets.aiSuggestedReply,
      aiExtractedIssues: tickets.aiExtractedIssues,
      aiKeywords: tickets.aiKeywords
    })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .get();

  if (!ticket) throw new Response('Ticket not found', { status: 404 });

  return {
    id: ticket.id,
    status: ticket.aiScreeningStatus,
    result: ticket.aiScreeningResult ? JSON.parse(ticket.aiScreeningResult) : null,
    suggestedReply: ticket.aiSuggestedReply,
    extractedIssues: ticket.aiExtractedIssues ? JSON.parse(ticket.aiExtractedIssues) : [],
    keywords: ticket.aiKeywords ? JSON.parse(ticket.aiKeywords) : []
  };
};
