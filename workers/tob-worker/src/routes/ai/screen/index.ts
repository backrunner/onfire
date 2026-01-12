import { Elysia, t } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../../core/types';
import * as handlers from './handlers';

export const aiScreenRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>()
    .post('/ai/screen/:ticketId', ({ store, user, params }) =>
      handlers.screenSingleTicket(env, store, user, params.ticketId))
    .post('/ai/prereply/:ticketId', ({ store, user, params }) =>
      handlers.generatePreReplyHandler(env, store, user, params.ticketId))
    .post('/tasks/ai-screen', ({ store, user, body }) =>
      handlers.batchScreen(env, store, user, body), {
      body: t.Object({
        ticketIds: t.Optional(t.Array(t.String())),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 }))
      })
    })
    .get('/ai/screen/:ticketId', ({ store, user, params }) =>
      handlers.getScreeningResult(env, store, user, params.ticketId));
