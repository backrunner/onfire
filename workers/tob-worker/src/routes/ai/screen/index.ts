import { inArray, isNull, eq } from 'drizzle-orm';
import { assertPermission } from '@onfire/shared/rbac';
import { tickets } from '@onfire/shared/drizzle/schema';
import { createRouter } from '../../../core/router';
import { handleResult, errorResult } from '../../../core/route-utils';
import { resolveContext } from '../../../core/context';
import { screenTicket, generatePreReply, batchScreenTickets } from '../../../services/ai/screening';
import { ok } from '../../../core/response';

export const aiScreenRoutes = () => {
  const router = createRouter();

  // POST /ai/screen/:ticketId
  router.post('/ai/screen/:ticketId', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'ticket.read');

    const ticketId = c.req.param('ticketId');
    const result = await screenTicket(db, ticketId);
    if (!result) {
      return c.json(ok({ success: false, message: 'Screening failed or no AI config available' }));
    }
    return c.json(ok({ success: true, result }));
  });

  // POST /ai/prereply/:ticketId
  router.post('/ai/prereply/:ticketId', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'ticket.read');

    const ticketId = c.req.param('ticketId');
    const result = await generatePreReply(db, ticketId);
    if (!result) {
      return c.json(ok({ success: false, message: 'Pre-reply generation failed or no AI config available' }));
    }
    return c.json(ok({ success: true, result }));
  });

  // POST /tasks/ai-screen
  router.post('/tasks/ai-screen', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'ticket.read');

    const body = await c.req.json<{ ticketIds?: string[]; limit?: number }>();
    let ticketIds: string[] = body.ticketIds ?? [];
    if (ticketIds.length === 0) {
      const unscreened = await db
        .select({ id: tickets.id })
        .from(tickets)
        .where(isNull(tickets.aiScreeningStatus))
        .limit(body.limit || 10)
        .all();
      ticketIds = unscreened.map((t: any) => t.id);
    }

    if (ticketIds.length === 0) {
      return c.json(ok({ success: true, message: 'No tickets to screen', processed: 0 }));
    }

    await db
      .update(tickets)
      .set({ aiScreeningStatus: 'processing' })
      .where(inArray(tickets.id, ticketIds));

    const results = await batchScreenTickets(db, ticketIds);
    const succeeded = Array.from(results.values()).filter((r) => r !== null).length;
    const failed = ticketIds.length - succeeded;

    return c.json(ok({ success: true, processed: ticketIds.length, succeeded, failed }));
  });

  // GET /ai/screen/:ticketId
  router.get('/ai/screen/:ticketId', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'ticket.read');

    const ticketId = c.req.param('ticketId');
    const ticket = await db
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

    return c.json(ok({
      id: ticket.id,
      status: ticket.aiScreeningStatus,
      result: ticket.aiScreeningResult ? JSON.parse(ticket.aiScreeningResult) : null,
      suggestedReply: ticket.aiSuggestedReply,
      extractedIssues: ticket.aiExtractedIssues ? JSON.parse(ticket.aiExtractedIssues) : [],
      keywords: ticket.aiKeywords ? JSON.parse(ticket.aiKeywords) : []
    }));
  });

  return router;
};
