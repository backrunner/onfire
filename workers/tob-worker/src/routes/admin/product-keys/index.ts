import { t } from 'elysia';
import type { Bindings } from '../../../core/types';
import { createRouter } from '../../../core/router';
import * as handlers from './handlers';

export const productKeyRoutes = (env: Bindings) =>
  createRouter()
    .get('/product-keys', ({ store, user, query }) => handlers.listProductKeys(env, store, user, query))
    .post('/product-keys', ({ store, user, body }) =>
      handlers.createProductKey(env, store, user, body), {
      body: t.Object({
        productId: t.String(),
        name: t.Optional(t.String())
      })
    })
    .post('/product-keys/:id/rotate', ({ store, user, params }) => handlers.rotateProductKey(env, store, user, params.id))
    .patch('/product-keys/:id/revoke', ({ store, user, params, body }) =>
      handlers.revokeProductKey(env, store, user, params.id, body), {
      body: t.Object({
        revoked: t.Optional(t.Boolean())
      })
    })
;
