import { Elysia, t } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../core/types';
import * as handlers from './handlers';

const KnowledgeBody = t.Object({
  title: t.String({ minLength: 1 }),
  content: t.String({ minLength: 1 }),
  knowledgeType: t.Union([
    t.Literal('description'),
    t.Literal('faq'),
    t.Literal('feature'),
    t.Literal('policy'),
    t.Literal('troubleshooting')
  ])
});

const KnowledgeUpdateBody = t.Object({
  title: t.Optional(t.String({ minLength: 1 })),
  content: t.Optional(t.String({ minLength: 1 })),
  knowledgeType: t.Optional(t.Union([
    t.Literal('description'),
    t.Literal('faq'),
    t.Literal('feature'),
    t.Literal('policy'),
    t.Literal('troubleshooting')
  ]))
});

export const knowledgeRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>()
    // Product Documents
    .get('/admin/products/:id/documents', ({ store, user, params }) =>
      handlers.listDocuments(env, store, user, params.id))
    .post('/admin/products/:id/documents', ({ store, user, params, request }) =>
      handlers.uploadDocument(env, store, user, params.id, request))
    .delete('/admin/products/:id/documents/:docId', ({ store, user, params }) =>
      handlers.deleteDocument(env, store, user, params.id, params.docId))
    .get('/admin/products/:id/documents/:docId/download', ({ store, user, params }) =>
      handlers.downloadDocument(env, store, user, params.id, params.docId))
    // Product Knowledge
    .get('/admin/products/:id/knowledge', ({ store, user, params }) =>
      handlers.listKnowledge(env, store, user, params.id))
    .post('/admin/products/:id/knowledge', ({ store, user, params, body }) =>
      handlers.createKnowledge(env, store, user, params.id, body), { body: KnowledgeBody })
    .patch('/admin/products/:id/knowledge/:knowledgeId', ({ store, user, params, body }) =>
      handlers.updateKnowledge(env, store, user, params.id, params.knowledgeId, body), { body: KnowledgeUpdateBody })
    .delete('/admin/products/:id/knowledge/:knowledgeId', ({ store, user, params }) =>
      handlers.deleteKnowledge(env, store, user, params.id, params.knowledgeId));
