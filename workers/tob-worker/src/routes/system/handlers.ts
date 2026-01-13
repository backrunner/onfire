import { rolePermissions } from '@onfire/shared';
import type { AuthUser, Bindings } from '../../core/types';
import { resolveContext } from '../../core/context';

export const health = () => ({ ok: true, scope: 'tob', ts: Date.now() });

export const me = async (env: Bindings, user: AuthUser | undefined) => {
  const ctx = await resolveContext(env, user);
  return {
    user: ctx.user,
    role: ctx.user.role,
    permissions: rolePermissions[ctx.user.role] ?? [],
    tenantIds: ctx.tenantIds,
    productIds: ctx.productIds,
    teamIds: ctx.teamIds
  };
};
