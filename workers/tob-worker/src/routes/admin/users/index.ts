import { t } from 'elysia';
import type { Bindings } from '../../../core/types';
import { createRouter } from '../../../core/router';
import * as handlers from './handlers';

export const userRoutes = (env: Bindings) =>
  createRouter()
    .get('/users', ({ store, user }) => handlers.listUsers(env, store, user))
    .patch('/users/:id', ({ store, user, params, body }) =>
      handlers.updateUser(env, store, user, params.id, body), {
      body: t.Object({}, { additionalProperties: true })
    })
;