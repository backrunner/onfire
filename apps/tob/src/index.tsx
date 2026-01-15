import { Hono } from 'hono';
import { reactRenderer } from '@hono/react-renderer';
import type { Bindings, Variables } from './core/types';
import { createAuthPlugin } from './core/auth';
import { prepare } from './core/db';
import { createDb } from '@onfire/shared/drizzle/client';
import { createAllRoutes } from './routes';
import { errorToResponse, isRawResponse } from './core/response';
import { StaticRouter } from 'react-router-dom/server';
import { ThemeProvider, I18nProvider } from '@onfire/ui';
import App from './App';
import { translations } from './locales';

// 声明 Props 类型扩展
declare module '@hono/react-renderer' {
  interface Props {
    title?: string;
  }
}

const ensureEnv = (env: Bindings) => {
  if (!env.AUTH_SECRET) console.warn('AUTH_SECRET missing - auth will fail');
  if (!env.DB) console.warn('DB binding missing');
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ==================== API Middleware ====================

// Middleware to set up db and auth
app.use('/api/*', async (c, next) => {
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
app.use('/api/*', async (c, next) => {
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

// ==================== API Routes ====================

const prefix = '/api/tob';

// Better Auth handler - must be before other routes
app.all(`${prefix}/auth/*`, async (c) => {
  const auth = c.get('auth');
  console.log('[Better Auth] Request:', c.req.method, c.req.path);
  const response = await auth.handler(c.req.raw);
  console.log('[Better Auth] Response:', response.status);
  return response;
});

// Mount API routes
app.route(prefix, createAllRoutes());

// Response wrapper middleware
app.use(`${prefix}/*`, async (c, next) => {
  await next();
  const response = c.res;
  if (isRawResponse(response)) {
    return;
  }
});

// API Error handler
app.onError((err, c) => {
  if (c.req.path.startsWith('/api/')) {
    const { response, status } = errorToResponse(err);
    return c.json(response, status as any);
  }
  // For non-API routes, let it propagate
  throw err;
});

// ==================== SSR Renderer ====================

// SSR 渲染器
app.get(
  '*',
  reactRenderer(
    ({ children, title }) => {
      return (
        <html lang="zh-CN">
          <head>
            <meta charSet="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>{title || 'OnFire Admin'}</title>
            {import.meta.env.PROD && (
              <link rel="stylesheet" href="/static/style.css" />
            )}
            {import.meta.env.DEV && (
              <link rel="stylesheet" href="/src/styles/index.css" />
            )}
          </head>
          <body className="bg-zinc-50 dark:bg-zinc-950">
            <div id="root">{children}</div>
            {import.meta.env.PROD && (
              <script type="module" src="/static/client.js"></script>
            )}
            {import.meta.env.DEV && (
              <script type="module" src="/src/client.tsx"></script>
            )}
          </body>
        </html>
      );
    },
    { docType: true }
  )
);

// SSR 页面渲染 - 渲染完整的 React App
app.get('*', async (c) => {
  const url = new URL(c.req.url);

  // 根据路径设置标题
  let title = 'OnFire Admin';
  if (url.pathname.startsWith('/tickets')) {
    title = 'Tickets - OnFire Admin';
  } else if (url.pathname.startsWith('/admin')) {
    title = 'Admin - OnFire Admin';
  } else if (url.pathname.startsWith('/account')) {
    title = 'Account - OnFire Admin';
  } else if (url.pathname === '/login') {
    title = 'Login - OnFire Admin';
  } else if (url.pathname === '/install') {
    title = 'Setup - OnFire Admin';
  }

  return c.render(
    <StaticRouter location={url.pathname}>
      <ThemeProvider>
        <I18nProvider translations={translations}>
          <App />
        </I18nProvider>
      </ThemeProvider>
    </StaticRouter>,
    { title }
  );
});

export default app;
