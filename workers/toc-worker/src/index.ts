import { Elysia } from 'elysia';
import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker';
import { createAuthPlugin } from './core/auth';
import type { Bindings, WorkerSingleton } from './core/types';
import { prepare } from './core/db';
import { createDb } from '@onfire/shared/drizzle/client';
import { createAllRoutes } from './routes';
import { wrapResponse, errorToResponse, isRawResponse } from './core/response';

const ensureEnv = (env: Bindings) => {
  if (!env.AUTH_SECRET) console.warn('AUTH_SECRET missing - auth will fail');
  if (!env.DB) console.warn('DB binding missing');
};

const createApp = (env: Bindings) => {
  ensureEnv(env);
  const { plugin: authPlugin, auth } = createAuthPlugin(env);
  const db = createDb(env.DB);
  return new Elysia<string, WorkerSingleton>({
    adapter: CloudflareAdapter,
    prefix: env.APP_PREFIX ?? '/api/toc',
    aot: false,
  })
    .state({ env, db, auth })
    .use(authPlugin)
    .onStart(() => prepare(env.DB))
    .onAfterHandle(({ response }) => {
      // Don't wrap raw Response objects (streaming, files, redirects, etc.)
      if (isRawResponse(response)) {
        return response;
      }
      // Wrap all other responses in unified format
      return wrapResponse(response);
    })
    .onError(({ code, error }) => {
      if (code === 'NOT_FOUND') {
        const { response, status } = errorToResponse(new Error('Not found'));
        return new Response(JSON.stringify(response), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Handle all other errors
      const { response, status } = errorToResponse(error);
      return new Response(JSON.stringify(response), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    })
    .use(createAllRoutes(env));
};

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const prefix = env.APP_PREFIX ?? '/api/toc';

    // Handle API routes
    if (url.pathname.startsWith(prefix)) {
      const app = createApp(env);
      const handler = app.fetch as (req: Request, bindings: Bindings, executionCtx: ExecutionContext) => Response | Promise<Response>;
      return handler(request, env, ctx);
    }

    // For non-API routes, let wrangler's asset handling serve static files
    // This handler won't be reached if assets are configured properly
    // It serves as a fallback for SPA routing
    if (env.ASSETS) {
      try {
        // Try to serve the exact file
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404) {
          return assetResponse;
        }
      } catch {
        // Asset not found, continue to SPA fallback
      }

      // SPA fallback - serve index.html for any non-asset route
      try {
        const indexRequest = new Request(new URL('/index.html', request.url), request);
        return await env.ASSETS.fetch(indexRequest);
      } catch {
        return new Response('Not Found', { status: 404 });
      }
    }

    return new Response('Not Found', { status: 404 });
  }
};
