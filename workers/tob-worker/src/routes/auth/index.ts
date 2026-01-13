import { t } from 'elysia';
import type { Auth } from 'better-auth';
import type { Bindings } from '../../core/types';
import { createRouter } from '../../core/router';
import * as handlers from './handlers';

export const authRoutes = (_env: Bindings, auth: Auth) =>
  createRouter()
    // Password change
    .post('/auth/change-password', ({ request, body }) =>
      handlers.changePassword(auth, request, body), {
      body: t.Object({
        currentPassword: t.Optional(t.String()),
        newPassword: t.Optional(t.String()),
        revokeOtherSessions: t.Optional(t.Boolean())
      })
    })
    // Install routes
    .get('/install/status', ({ store }) => handlers.getInstallStatus(store))
    .post('/install/finalize', ({ store, request, body }) =>
      handlers.finalizeInstall(store, auth, request, body), {
      body: t.Object({
        tenantName: t.Optional(t.String()),
        displayName: t.Optional(t.String())
      })
    })
;
