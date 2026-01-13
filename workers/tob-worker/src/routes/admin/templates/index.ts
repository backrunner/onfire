import { t } from 'elysia';
import type { Bindings } from '../../../core/types';
import { createRouter } from '../../../core/router';
import * as handlers from './handlers';

export const templateRoutes = (env: Bindings) =>
  createRouter()
    .get('/templates', ({ store, user }) => handlers.listTemplates(env, store, user))
    .post('/templates', ({ store, user, body }) =>
      handlers.createTemplate(env, store, user, body), {
      body: t.Object({
        productId: t.String(),
        title: t.String(),
        categories: t.String(),
        formSchema: t.String()
      })
    })
    .patch('/templates/:id', ({ store, user, params, body }) =>
      handlers.updateTemplate(env, store, user, params.id, body), {
      body: t.Object({
        title: t.Optional(t.String()),
        categories: t.Optional(t.String()),
        formSchema: t.Optional(t.String())
      })
    })
    .delete('/templates/:id', ({ store, user, params }) => handlers.deleteTemplate(env, store, user, params.id))
;
