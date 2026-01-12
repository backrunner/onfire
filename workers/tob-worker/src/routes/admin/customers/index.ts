import { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../../core/types';
import * as handlers from './handlers';

export const customerRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>()
    .get('/customers', ({ store, user, query }) => handlers.listCustomers(env, store, user, query));
