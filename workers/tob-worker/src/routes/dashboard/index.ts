import type { Bindings } from '../../core/types';
import { createRouter } from '../../core/router';
import * as handlers from './handlers';

export const dashboardRoutes = (env: Bindings) =>
  createRouter({ prefix: '/dashboard' })
    .get('/summary', ({ user, store }) => handlers.getSummary(env, store, user))
;
