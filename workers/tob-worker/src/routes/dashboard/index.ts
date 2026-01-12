import { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../core/types';
import * as handlers from './handlers';

export const dashboardRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>({ prefix: '/dashboard' })
    .get('/summary', ({ user, store }) => handlers.getSummary(env, store, user));
