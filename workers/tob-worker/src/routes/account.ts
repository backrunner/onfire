import { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from '../core/types';

export const createAccountRoutes = (_env: Bindings, auth: any) =>
  new Elysia<string, WorkerSingleton>({ prefix: '/auth' }).post('/change-password', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { currentPassword?: string; newPassword?: string; revokeOtherSessions?: boolean };
    if (!body.currentPassword || !body.newPassword) return new Response('currentPassword and newPassword required', { status: 400 });

    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) return new Response('unauthorized', { status: 401 });

    try {
      await auth.api.changePassword({
        headers: request.headers,
        body: {
          currentPassword: body.currentPassword,
          newPassword: body.newPassword,
          revokeOtherSessions: body.revokeOtherSessions ?? true
        }
      });
      return { ok: true };
    } catch (err) {
      console.error('changePassword failed', err);
      return new Response('change-password failed', { status: 400 });
    }
  });
