import { Elysia } from 'elysia';
import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker';
import { createAuthPlugin } from './core/auth';
import type { Bindings } from './core/types';
import { prepare } from './core/db';
import { createDb } from '@onfire/shared/drizzle/client';
import { createSystemRoutes } from './routes/system';
import { createTemplateRoutes } from './routes/templates';
import { createTicketRoutes } from './routes/tickets';
import { createTaskRoutes } from './routes/tasks';
import { createTokenRoutes } from './routes/tokens';

const createApp = (env: Bindings) =>
  new Elysia({ adapter: CloudflareAdapter, prefix: env.APP_PREFIX ?? '/api/toc' })
    .state({ env, db: createDb(env.DB) })
    .use(createAuthPlugin(env))
    .onStart(() => prepare(env.DB))
    .use(createSystemRoutes(env))
    .use(createTemplateRoutes(env))
    .use(createTicketRoutes(env))
    .use(createTokenRoutes(env))
    .use(createTaskRoutes())
    .compile();

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    const app = createApp(env);
    const handler = app.fetch as (req: Request, bindings: Bindings, executionCtx: ExecutionContext) => Response | Promise<Response>;
    return handler(request, env, ctx);
  }
};
