import type { Bindings } from '../../../core/types';
import { createRouter } from '../../../core/router';
import * as handlers from './handlers';

export const customerRoutes = (env: Bindings) =>
  createRouter()
    .get('/customers', ({ store, user, query }) => handlers.listCustomers(env, store, user, query))
;
