import { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../core/types';
import { aiConfigRoutes } from './config';
import { aiScreenRoutes } from './screen';
import { aiChatRoutes } from './chat';

export const aiRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>()
    .use(aiConfigRoutes(env))
    .use(aiScreenRoutes(env))
    .use(aiChatRoutes(env));
