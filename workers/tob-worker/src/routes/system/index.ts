import type { Bindings } from '../../core/types';
import { createRouter } from '../../core/router';
import * as handlers from './handlers';

export const systemRoutes = (env: Bindings) =>
  createRouter()
    .get('/health', handlers.health)
    .get('/me', ({ user }) => handlers.me(env, user));
