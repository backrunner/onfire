import { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../../core/types';
import * as handlers from './handlers';

export const teamRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>()
    .get('/teams', ({ store, user }) => handlers.listTeams(env, store, user))
    .post('/teams', async ({ store, user, request }) => {
      const body = await request.json() as { name: string; allowReassign?: boolean; tenantId?: string };
      return handlers.createTeam(env, store, user, body);
    })
    .patch('/teams/:id', async ({ store, user, params, request }) => {
      const body = await request.json() as { name?: string; allowReassign?: boolean };
      return handlers.updateTeam(env, store, user, params.id, body);
    })
    .delete('/teams/:id', ({ store, user, params }) => handlers.deleteTeam(env, store, user, params.id));
