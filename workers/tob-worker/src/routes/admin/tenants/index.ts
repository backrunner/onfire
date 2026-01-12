import { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../../core/types';
import * as handlers from './handlers';

export const tenantRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>()
    .get('/tenants', ({ store, user }) => handlers.listTenants(env, store, user))
    .post('/tenants', async ({ store, user, request }) => {
      const body = await request.json() as { name: string };
      return handlers.createTenant(env, store, user, body);
    })
    .patch('/tenants/:id', async ({ store, user, params, request }) => {
      const body = await request.json() as { name?: string };
      return handlers.updateTenant(env, store, user, params.id, body);
    })
    .delete('/tenants/:id', ({ store, user, params }) => handlers.deleteTenant(env, store, user, params.id));
