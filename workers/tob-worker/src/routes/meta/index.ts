import { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../core/types';
import * as handlers from './handlers';

export const metaRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>({ prefix: '/meta' })
    .get('/teams', ({ store, user }) => handlers.getTeams(env, store, user))
    .get('/products', ({ store, user }) => handlers.getProducts(env, store, user));
