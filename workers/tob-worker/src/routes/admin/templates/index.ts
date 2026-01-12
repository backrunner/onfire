import { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../../core/types';
import * as handlers from './handlers';

export const templateRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>()
    .get('/templates', ({ store, user }) => handlers.listTemplates(env, store, user))
    .post('/templates', async ({ store, user, request }) => {
      const body = await request.json() as { productId: string; title: string; categories: string; formSchema: string };
      return handlers.createTemplate(env, store, user, body);
    })
    .patch('/templates/:id', async ({ store, user, params, request }) => {
      const body = await request.json() as { title?: string; categories?: string; formSchema?: string };
      return handlers.updateTemplate(env, store, user, params.id, body);
    })
    .delete('/templates/:id', ({ store, user, params }) => handlers.deleteTemplate(env, store, user, params.id));
