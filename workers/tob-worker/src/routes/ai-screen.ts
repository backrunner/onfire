/**
 * AI Screening Routes
 * Endpoints for ticket screening and pre-reply generation
 */

import { Elysia, t } from 'elysia';
import { eq, inArray, isNull } from 'drizzle-orm';
import type { Bindings, WorkerSingleton } from '../core/types';
import { resolveContext } from '../core/context';
import { assertPermission } from '@onfire/shared/rbac';
import { tickets } from '@onfire/shared/drizzle/schema';
import { screenTicket, generatePreReply, batchScreenTickets } from '../services/ai/screening';

export const createAIScreenRoutes = (env: Bindings) =>
  new Elysia<'', false, WorkerSingleton>()
    // Screen a single ticket
    .post('/ai/screen/:ticketId', async ({ store, params }) => {
      const user = store.decorator.user;
      if (!user?.id) throw new Response('Unauthorized', { status: 401 });

      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'ticket.read');

      const result = await screenTicket(store.db, params.ticketId);

      if (!result) {
        return { success: false, message: 'Screening failed or no AI config available' };
      }

      return { success: true, result };
    })

    // Generate pre-reply for a ticket
    .post('/ai/prereply/:ticketId', async ({ store, params }) => {
      const user = store.decorator.user;
      if (!user?.id) throw new Response('Unauthorized', { status: 401 });

      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'ticket.read');

      const result = await generatePreReply(store.db, params.ticketId);

      if (!result) {
        return { success: false, message: 'Pre-reply generation failed or no AI config available' };
      }

      return { success: true, result };
    })

    // Background task: Batch screen pending tickets
    .post(
      '/tasks/ai-screen',
      async ({ store, body }) => {
        const user = store.decorator.user;
        if (!user?.id) throw new Response('Unauthorized', { status: 401 });

        const ctx = await resolveContext(env, user);
        assertPermission(ctx, 'ticket.read');

        // Get tickets that haven't been screened
        let ticketIds = body.ticketIds;

        if (!ticketIds || ticketIds.length === 0) {
          // Get unscreened tickets
          const unscreened = await store.db
            .select({ id: tickets.id })
            .from(tickets)
            .where(isNull(tickets.aiScreeningStatus))
            .limit(body.limit || 10)
            .all();

          ticketIds = unscreened.map((t) => t.id);
        }

        if (ticketIds.length === 0) {
          return { success: true, message: 'No tickets to screen', processed: 0 };
        }

        // Mark tickets as processing
        await store.db
          .update(tickets)
          .set({ aiScreeningStatus: 'processing' })
          .where(inArray(tickets.id, ticketIds));

        // Process tickets
        const results = await batchScreenTickets(store.db, ticketIds);

        const succeeded = Array.from(results.values()).filter((r) => r !== null).length;
        const failed = ticketIds.length - succeeded;

        return {
          success: true,
          processed: ticketIds.length,
          succeeded,
          failed
        };
      },
      {
        body: t.Object({
          ticketIds: t.Optional(t.Array(t.String())),
          limit: t.Optional(t.Number({ minimum: 1, maximum: 100 }))
        })
      }
    )

    // Get screening result for a ticket
    .get('/ai/screen/:ticketId', async ({ store, params }) => {
      const user = store.decorator.user;
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
        .where(eq(tickets.id, params.ticketId))
        .get();

      if (!ticket) {
        throw new Response('Ticket not found', { status: 404 });
      }

      return {
        id: ticket.id,
        status: ticket.aiScreeningStatus,
        result: ticket.aiScreeningResult ? JSON.parse(ticket.aiScreeningResult) : null,
        suggestedReply: ticket.aiSuggestedReply,
        extractedIssues: ticket.aiExtractedIssues ? JSON.parse(ticket.aiExtractedIssues) : [],
        keywords: ticket.aiKeywords ? JSON.parse(ticket.aiKeywords) : []
      };
    });
