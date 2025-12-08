import { Elysia } from 'elysia';
import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker';
import { createAuthPlugin } from './core/auth';
import type { Bindings } from './core/types';
import { prepare } from './core/db';
import { createDb } from '@onfire/shared/drizzle/client';
import { createSystemRoutes } from './routes/system';
import { createDashboardRoutes } from './routes/dashboard';
import { createAdminRoutes } from './routes/admin';
import { createMetaRoutes } from './routes/meta';
import { createTicketRoutes } from './routes/tickets';

const createApp = (env: Bindings) =>
  new Elysia({ adapter: CloudflareAdapter, prefix: env.APP_PREFIX ?? '/api/tob' })
    .state({ env, db: createDb(env.DB) })
    .use(createAuthPlugin(env))
    .onStart(() => prepare(env.DB))
    .onError(({ code }) => {
      if (code === 'NOT_FOUND') return new Response('not found', { status: 404 });
    })
    .use(createSystemRoutes(env))
    .use(createDashboardRoutes(env))
    .use(createAdminRoutes(env))
    .use(createMetaRoutes(env))
    .use(createTicketRoutes(env))
    .compile();

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    const app = createApp(env);
    return (app as any).fetch(request, env, ctx);
  }
};
