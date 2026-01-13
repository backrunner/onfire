import { createRouter } from '../../core/router';
import * as handlers from './handlers';

export const taskRoutes = () =>
  createRouter()
    .post('/tasks/sla-scan', ({ request, store }) => handlers.slaScan(store, request))
;
