import { t } from 'elysia';
import type { Bindings } from '../../core/types';
import { createRouter } from '../../core/router';
import * as handlers from './handlers';

export const ticketRoutes = (env: Bindings) =>
  createRouter()
    .get('/tickets', ({ query, store, user }) => handlers.listTickets(env, store, user, query))
    .get('/tickets/:id', ({ params, store, user }) => handlers.getTicketById(env, store, user, params.id))
    .post('/tickets/:id/status', ({ params, body, user, store }) =>
      handlers.updateStatus(env, store, user, params.id, body as any), {
      body: t.Object({
        status: t.Optional(t.String()),
        priority: t.Optional(t.String()),
        reason: t.Optional(t.String())
      })
    })
    .post('/tickets/:id/assign', ({ params, body, user, store }) =>
      handlers.assignTicket(env, store, user, params.id, body), {
      body: t.Object({
        assigneeId: t.Optional(t.String())
      })
    })
    .post('/tickets/:id/priority', ({ params, body, user, store }) =>
      handlers.updatePriority(env, store, user, params.id, body as any), {
      body: t.Object({
        priority: t.String(),
        reason: t.String()
      })
    })
    .post('/tickets/:id/close', ({ params, body, user, store }) =>
      handlers.closeTicket(env, store, user, params.id, body), {
      body: t.Object({
        reason: t.Optional(t.String())
      })
    })
    .post('/tickets/status/bulk', ({ body, user, store }) =>
      handlers.bulkUpdateStatus(env, store, user, body as any), {
      body: t.Object({
        ids: t.Optional(t.Array(t.String())),
        status: t.Optional(t.String()),
        reason: t.Optional(t.String())
      })
    })
    .post('/tickets/assign/bulk', ({ body, user, store }) =>
      handlers.bulkAssign(env, store, user, body), {
      body: t.Object({
        ids: t.Optional(t.Array(t.String())),
        assigneeId: t.Optional(t.String())
      })
    })
    .post('/tickets/:id/escalate', ({ params, body, user, store }) =>
      handlers.escalateTicket(env, store, user, params.id, body), {
      body: t.Object({
        reason: t.Optional(t.String())
      })
    })
    .post('/tickets/:id/reply', ({ params, body, user, store }) =>
      handlers.replyToTicket(env, store, user, params.id, body), {
      body: t.Object({
        content: t.String(),
        internal: t.Optional(t.Boolean())
      })
    })
;
