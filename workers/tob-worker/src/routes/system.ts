import { rolePermissions } from '@onfire/shared';
import { Elysia } from 'elysia';
import { resolveContext } from '../core/context';
import type { Bindings } from '../core/types';

export const createSystemRoutes = (env: Bindings) =>
  new Elysia()
    .get('/health', () => ({ ok: true, scope: 'tob', ts: Date.now() }))
    .get('/me', async ({ user }) => {
      const ctx = await resolveContext(env, user);
      return {
        user: ctx.user,
        role: ctx.user.role,
        permissions: rolePermissions[ctx.user.role] ?? [],
        tenantIds: ctx.tenantIds,
        productIds: ctx.productIds,
        teamIds: ctx.teamIds
      };
    });
