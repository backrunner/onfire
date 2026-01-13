import type { Bindings } from '../../core/types';
import { createRouter } from '../../core/router';
import * as handlers from './handlers';

export const ticketRoutes = (env: Bindings) =>
  createRouter()
    .get('/templates', ({ request, store, query }) => handlers.listTemplates(env, store, request, query))
    .post('/tickets', ({ request, store }) => handlers.createTicket(env, store, request))
    .get('/tickets', ({ query, request, store }) => handlers.listTickets(env, store, request, query))
    .get('/tickets/:id', ({ params, request, store }) => handlers.getTicket(env, store, request, params.id))
    .post('/tickets/:id/reply', ({ params, request, store }) => handlers.replyToTicket(env, store, request, params.id))
    .post('/tickets/:id/escalate', ({ params, request, store }) => handlers.escalateTicket(env, store, request, params.id))
    .post('/tickets/:id/close', ({ params, request, store }) => handlers.closeTicket(env, store, request, params.id))
    .post('/tickets/:id/reopen', ({ params, request, store }) => handlers.reopenTicket(env, store, request, params.id))
;
