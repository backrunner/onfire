import { Elysia, t } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../core/types';
import * as handlers from './handlers';

export const searchRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>()
    .get('/search', ({ store, user, query }) =>
      handlers.search(env, store, user, query))
    .get('/search/suggestions', ({ store, user, query }) =>
      handlers.getSuggestions(env, store, user, query.q as string))
    .post('/search/index/:ticketId', ({ store, user, params }) =>
      handlers.indexSingleTicket(env, store, user, params.ticketId))
    .post('/search/index/batch', ({ store, user, body }) =>
      handlers.batchIndex(env, store, user, body.ticketIds), {
      body: t.Object({
        ticketIds: t.Array(t.String())
      })
    });
