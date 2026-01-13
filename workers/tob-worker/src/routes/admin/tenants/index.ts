import { t } from 'elysia';
import type { Bindings } from '../../../core/types';
import { createRouter } from '../../../core/router';
import * as handlers from './handlers';

export const tenantRoutes = (env: Bindings) =>
  createRouter()
    .get('/tenants', ({ store, user }) => handlers.listTenants(env, store, user))
    .post('/tenants', ({ store, user, body }) =>
      handlers.createTenant(env, store, user, body), {
      body: t.Object({ name: t.String() })
    })
    .patch('/tenants/:id', ({ store, user, params, body }) =>
      handlers.updateTenant(env, store, user, params.id, body), {
      body: t.Object({ name: t.Optional(t.String()) })
    })
    .delete('/tenants/:id', ({ store, user, params }) => handlers.deleteTenant(env, store, user, params.id))
;
