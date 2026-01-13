import type { Bindings } from '../../core/types';
import { createRouter } from '../../core/router';
import * as handlers from './handlers';

export const metaRoutes = (env: Bindings) =>
  createRouter({ prefix: '/meta' })
    .get('/teams', ({ store, user }) => handlers.getTeams(env, store, user))
    .get('/products', ({ store, user }) => handlers.getProducts(env, store, user))
;
