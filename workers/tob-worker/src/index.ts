import { Elysia } from 'elysia';
import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker';
import { createAuthPlugin } from './core/auth';
import type { Bindings, WorkerSingleton } from './core/types';
import { prepare } from './core/db';
import { createDb } from '@onfire/shared/drizzle/client';
import { createSystemRoutes } from './routes/system';
import { createDashboardRoutes } from './routes/dashboard';
import { createAdminRoutes } from './routes/admin';
import { createMetaRoutes } from './routes/meta';
import { createTicketRoutes } from './routes/tickets';
import { createInstallRoutes } from './routes/install';
import { createAccountRoutes } from './routes/account';

const ensureEnv = (env: Bindings) => {
  if (!env.AUTH_SECRET) console.warn('AUTH_SECRET missing - auth will fail');
  if (!env.DB) console.warn('DB binding missing');
};

const createApp = (env: Bindings) => {
  ensureEnv(env);
  const { plugin: authPlugin, auth } = createAuthPlugin(env);
  const db = createDb(env.DB);
  return new Elysia<string, WorkerSingleton>({ adapter: CloudflareAdapter, prefix: env.APP_PREFIX ?? '/api/tob' })
    .state({ env, db, auth })
    .use(authPlugin)
    .onStart(() => prepare(env.DB))
    .onError(({ code }) => {
      if (code === 'NOT_FOUND') return new Response('not found', { status: 404 });
    })
    .use(createInstallRoutes(env, auth))
    .use(createAccountRoutes(env, auth))
    .use(createSystemRoutes(env))
    .use(createDashboardRoutes(env))
    .use(createAdminRoutes(env))
    .use(createMetaRoutes(env))
    .use(createTicketRoutes(env))
    .compile();
};

export default {
  fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    const app = createApp(env);
    return (app as any).fetch(request, env, ctx);
  }
};
