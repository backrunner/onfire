import { Role } from "@/lib/types";

export function canAccessManagement(role: Role): boolean {
  return (
    role === Role.SuperAdmin ||
    role === Role.TenantAdmin ||
    role === Role.ProductAdmin
  );
}

export interface ManagementActor {
  role: Role;
  user: { tenantId: string };
  productIds: string[];
}

/** Role-specific configuration landing. Null means the sidebar item is hidden. */
export function managementEntryHref(me: ManagementActor): string | null {
  if (me.role === Role.SuperAdmin) return "/admin/management";
  if (me.role === Role.TenantAdmin && me.user.tenantId) {
    return `/admin/management/tenants/${me.user.tenantId}`;
  }
  if (me.role === Role.ProductAdmin) {
    if (me.productIds.length === 1) {
      return `/admin/management/products/${me.productIds[0]}`;
    }
    if (me.productIds.length > 1) return "/admin/management";
  }
  return null;
}

export function canViewTenantConfiguration(
  me: ManagementActor,
  tenantId: string
): boolean {
  return (
    me.role === Role.SuperAdmin ||
    (me.role === Role.TenantAdmin && me.user.tenantId === tenantId)
  );
}
