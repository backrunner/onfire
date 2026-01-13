import { t } from 'elysia';
import type { Bindings } from '../../../core/types';
import { createRouter } from '../../../core/router';
import * as handlers from './handlers';

const ChatMessageBody = t.Object({
  message: t.String({ minLength: 1 }),
  sessionId: t.Optional(t.String())
});

export const aiChatRoutes = (env: Bindings) =>
  createRouter()
    .post('/ai/chat', ({ store, user, body, request }) =>
      handlers.sendChatMessage(env, store, user, request, body), { body: ChatMessageBody })
    .get('/ai/chat/history', ({ store, user, query }) =>
      handlers.getChatHistory(env, store, user, query.sessionId as string | undefined))
    .delete('/ai/chat/session/:sessionId', ({ store, user, params }) =>
      handlers.clearSession(env, store, user, params.sessionId))
;
