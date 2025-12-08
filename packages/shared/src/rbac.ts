import { Role, hasPermission, type Permission, type SessionContext, type TeamID, type TenantID, type ProductID } from './index';

export interface Scope {
  tenantId?: TenantID;
  productId?: ProductID;
  teamId?: TeamID;
}

export const assertPermission = (ctx: SessionContext, perm: Permission, scope?: Scope) => {
  const forbidden = () => {
    // Throw Response to let worker handlers bubble consistent 403 without exposing stack
    throw new Response('forbidden', { status: 403 });
  };

  if (!hasPermission(ctx.user.role, perm)) forbidden();

  if (ctx.user.role === Role.SuperAdmin) return true;
  if (scope?.tenantId && !ctx.tenantIds.includes(scope.tenantId)) forbidden();
  if (scope?.productId && !ctx.productIds.includes(scope.productId)) forbidden();
  if (scope?.teamId && !ctx.teamIds.includes(scope.teamId)) forbidden();
  return true;
};

