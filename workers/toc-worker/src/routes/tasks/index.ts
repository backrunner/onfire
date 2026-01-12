import { Elysia } from 'elysia';
import type { WorkerSingleton } from '../../core/types';
import * as handlers from './handlers';

export const taskRoutes = () =>
  new Elysia<string, WorkerSingleton>()
    .post('/tasks/sla-scan', ({ request, store }) => handlers.slaScan(store, request));
