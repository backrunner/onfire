import { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../core/types';
import * as handlers from './handlers';

export const authRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>({ prefix: '/tokens' })
    .post('/issue', ({ request, store }) => handlers.issueToken(env, store, request));
