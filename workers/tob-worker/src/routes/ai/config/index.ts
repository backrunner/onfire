import { Elysia, t } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../../core/types';
import * as handlers from './handlers';

const AIConfigBody = t.Object({
  taskType: t.Union([
    t.Literal('agent'),
    t.Literal('prescreening'),
    t.Literal('prereply'),
    t.Literal('embedding')
  ]),
  provider: t.Union([
    t.Literal('openai'),
    t.Literal('anthropic'),
    t.Literal('google'),
    t.Literal('xai'),
    t.Literal('deepseek')
  ]),
  model: t.String({ minLength: 1 }),
  apiKey: t.String({ minLength: 1 }),
  baseUrl: t.Optional(t.String()),
  enabled: t.Optional(t.Boolean())
});

const AIConfigUpdateBody = t.Object({
  provider: t.Optional(
    t.Union([
      t.Literal('openai'),
      t.Literal('anthropic'),
      t.Literal('google'),
      t.Literal('xai'),
      t.Literal('deepseek')
    ])
  ),
  model: t.Optional(t.String({ minLength: 1 })),
  apiKey: t.Optional(t.String({ minLength: 1 })),
  baseUrl: t.Optional(t.String()),
  enabled: t.Optional(t.Boolean())
});

export const aiConfigRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>()
    .get('/admin/ai-config/meta', ({ store, user }) => handlers.getMeta(env, store, user))
    .get('/admin/ai-config', ({ store, user }) => handlers.listConfigs(env, store, user))
    .post('/admin/ai-config', ({ store, user, body }) => handlers.createConfig(env, store, user, body), { body: AIConfigBody })
    .patch('/admin/ai-config/:id', ({ store, user, params, body }) => handlers.updateConfig(env, store, user, params.id, body), { body: AIConfigUpdateBody })
    .delete('/admin/ai-config/:id', ({ store, user, params }) => handlers.deleteConfig(env, store, user, params.id))
    .post('/admin/ai-config/:id/test', ({ store, user, params }) => handlers.testConfig(env, store, user, params.id));
