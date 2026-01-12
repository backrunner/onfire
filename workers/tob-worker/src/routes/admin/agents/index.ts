import { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../../core/types';
import * as handlers from './handlers';

export const agentRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>()
    .get('/agents', ({ store, user }) => handlers.listAgents(env, store, user))
    .patch('/agents/:id', async ({ store, user, params, request }) => {
      const body = await request.json() as any;
      return handlers.updateAgent(env, store, user, params.id, body);
    });
