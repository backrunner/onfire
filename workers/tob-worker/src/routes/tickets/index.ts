import { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../core/types';
import * as handlers from './handlers';

export const ticketRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>()
    .get('/tickets', ({ query, store, user }) => handlers.listTickets(env, store, user, query))
    .get('/tickets/:id', ({ params, store, user }) => handlers.getTicketById(env, store, user, params.id))
    .post('/tickets/:id/status', async ({ params, request, user, store }) => {
      const body = await request.json() as { status?: any; priority?: any; reason?: string };
      return handlers.updateStatus(env, store, user, params.id, body);
    })
    .post('/tickets/:id/assign', async ({ params, request, user, store }) => {
      const body = await request.json() as { assigneeId?: string };
      return handlers.assignTicket(env, store, user, params.id, body);
    })
    .post('/tickets/:id/priority', async ({ params, request, user, store }) => {
      const body = await request.json() as { priority: any; reason: string };
      return handlers.updatePriority(env, store, user, params.id, body);
    })
    .post('/tickets/:id/close', async ({ params, request, user, store }) => {
      const body = await request.json() as { reason?: string };
      return handlers.closeTicket(env, store, user, params.id, body);
    })
    .post('/tickets/status/bulk', async ({ request, user, store }) => {
      const body = await request.json() as { ids?: string[]; status?: any; reason?: string };
      return handlers.bulkUpdateStatus(env, store, user, body);
    })
    .post('/tickets/assign/bulk', async ({ request, user, store }) => {
      const body = await request.json() as { ids?: string[]; assigneeId?: string };
      return handlers.bulkAssign(env, store, user, body);
    })
    .post('/tickets/:id/escalate', async ({ params, request, user, store }) => {
      const body = await request.json() as { reason?: string };
      return handlers.escalateTicket(env, store, user, params.id, body);
    })
    .post('/tickets/:id/reply', async ({ params, request, user, store }) => {
      const body = await request.json() as { content: string; internal?: boolean };
      return handlers.replyToTicket(env, store, user, params.id, body);
    });
