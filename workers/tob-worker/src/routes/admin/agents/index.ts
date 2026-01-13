import { t } from 'elysia';
import type { Bindings } from '../../../core/types';
import { createRouter } from '../../../core/router';
import * as handlers from './handlers';

export const agentRoutes = (env: Bindings) =>
  createRouter()
    .get('/agents', ({ store, user }) => handlers.listAgents(env, store, user))
    .patch('/agents/:id', ({ store, user, params, body }) =>
      handlers.updateAgent(env, store, user, params.id, body), {
      body: t.Object({}, { additionalProperties: true })
    })
;
