import { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../core/types';
import * as handlers from './handlers';

export const systemRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>()
    .get('/health', handlers.health)
    .get('/me', ({ user }) => handlers.me(env, user));
