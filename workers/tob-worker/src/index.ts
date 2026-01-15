import { Hono } from 'hono';
import { createAuthPlugin } from './core/auth';
import type { Bindings, Variables } from './core/types';
import { prepare } from './core/db';
import { createDb } from '@onfire/shared/drizzle/client';
import { createAllRoutes } from './routes';
import { wrapResponse, errorToResponse, isRawResponse } from './core/response';

const ensureEnv = (env: Bindings) => {
  if (!env.AUTH_SECRET) console.warn('AUTH_SECRET missing - auth will fail');
  if (!env.DB) console.warn('DB binding missing');
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Middleware to set up db and auth
app.use('*', async (c, next) => {
  ensureEnv(c.env);
  const db = createDb(c.env.DB);
  const { auth } = createAuthPlugin(c.env, db);
  c.set('db', db);
  c.set('auth', auth);

  // Run DB preparation
  await prepare(c.env.DB);

  await next();
});

// Auth middleware to extract user from session
app.use('*', async (c, next) => {
  const auth = c.get('auth');
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session?.user) {
      c.set('user', {
        id: session.user.id,
        email: session.user.email,
        role: (session.user as any).role
      });
    }
  } catch {
    // No session, continue without user
  }
  await next();
});

// Mount Better Auth handler BEFORE other routes
// This handles all auth routes
const prefix = '/api/tob';

// Use a more specific pattern to catch all auth routes
app.all(`${prefix}/auth/*`, async (c) => {
  const auth = c.get('auth');
  console.log('[Better Auth] Request URL:', c.req.raw.url);
  console.log('[Better Auth] Request method:', c.req.method);
  console.log('[Better Auth] Request path:', c.req.path);
  const response = await auth.handler(c.req.raw);
  console.log('[Better Auth] Response status:', response.status);
  return response;
});

// Mount API routes
app.route(prefix, createAllRoutes());

// Response wrapper middleware - applied after route handlers
app.use(`${prefix}/*`, async (c, next) => {
  await next();

  // Don't wrap raw Response objects
  const response = c.res;
  if (isRawResponse(response)) {
    return;
  }
});

// Error handler
app.onError((err, c) => {
  const { response, status } = errorToResponse(err);
  return c.json(response, status as any);
});

// 404 handler for API routes
app.notFound((c) => {
  const { response, status } = errorToResponse(new Error('Not found'));
  return c.json(response, status as any);
});

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const apiPrefix = env.APP_PREFIX ?? '/api/tob';

    // Handle API routes
    if (url.pathname.startsWith(apiPrefix)) {
      return app.fetch(request, env, ctx);
    }

    // For non-API routes, let wrangler's asset handling serve static files
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
