import { t } from 'elysia';
import type { Bindings } from '../../../core/types';
import { createRouter } from '../../../core/router';
import * as handlers from './handlers';

export const productRoutes = (env: Bindings) =>
  createRouter()
    .get('/products', ({ store, user }) => handlers.listProducts(env, store, user))
    .post('/products', ({ store, user, body }) =>
      handlers.createProduct(env, store, user, body), {
      body: t.Object({
        name: t.String(),
        tenantId: t.Optional(t.String()),
        sla: t.Optional(t.Object({
          highAccept: t.Optional(t.Number()),
          highReply: t.Optional(t.Number()),
          mediumAccept: t.Optional(t.Number()),
          mediumReply: t.Optional(t.Number()),
          lowAccept: t.Optional(t.Number()),
          lowReply: t.Optional(t.Number())
        })),
        teamIds: t.Optional(t.Array(t.String()))
      }, { additionalProperties: true })
    })
    .patch('/products/:id', ({ store, user, params, body }) =>
      handlers.updateProduct(env, store, user, params.id, body), {
      body: t.Object({
        name: t.Optional(t.String()),
        sla: t.Optional(t.Object({
          highAccept: t.Optional(t.Number()),
          highReply: t.Optional(t.Number()),
          mediumAccept: t.Optional(t.Number()),
          mediumReply: t.Optional(t.Number()),
          lowAccept: t.Optional(t.Number()),
          lowReply: t.Optional(t.Number())
        })),
        teamIds: t.Optional(t.Array(t.String()))
      }, { additionalProperties: true })
    })
    .delete('/products/:id', ({ store, user, params }) => handlers.deleteProduct(env, store, user, params.id))
;
