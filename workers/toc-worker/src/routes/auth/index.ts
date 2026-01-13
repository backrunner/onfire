import type { Bindings } from '../../core/types';
import { createRouter } from '../../core/router';
import * as handlers from './handlers';

export const authRoutes = (env: Bindings) =>
  createRouter({ prefix: '/tokens' })
    .post('/issue', ({ request, store }) => handlers.issueToken(env, store, request))
;
