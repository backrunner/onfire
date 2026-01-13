import type { Bindings } from '../../core/types';
import { createRouter } from '../../core/router';
import { aiConfigRoutes } from './config';
import { aiScreenRoutes } from './screen';
import { aiChatRoutes } from './chat';

export const aiRoutes = (env: Bindings) =>
  createRouter()
    .use(aiConfigRoutes(env))
    .use(aiScreenRoutes(env))
    .use(aiChatRoutes(env))
;
