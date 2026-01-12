import { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from '../../core/types';
import * as handlers from './handlers';

export const authRoutes = (_env: Bindings, auth: any) =>
  new Elysia<string, WorkerSingleton>()
    // Password change
    .post('/auth/change-password', async ({ request }) => {
      const body = await request.json().catch(() => ({})) as { currentPassword?: string; newPassword?: string; revokeOtherSessions?: boolean };
      return handlers.changePassword(auth, request, body);
    })
    // Install routes
    .get('/install/status', ({ store }) => handlers.getInstallStatus(store))
    .post('/install/finalize', async ({ store, request }) => {
      const body = await request.json().catch(() => ({})) as { tenantName?: string; displayName?: string };
      return handlers.finalizeInstall(store, auth, request, body);
    });
