import { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../../core/types';
import * as handlers from './handlers';

export const userRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>()
    .get('/users', ({ store, user }) => handlers.listUsers(env, store, user))
    .patch('/users/:id', async ({ store, user, params, request }) => {
      const body = await request.json() as any;
      return handlers.updateUser(env, store, user, params.id, body);
    });
