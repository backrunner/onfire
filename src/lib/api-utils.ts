import { Role } from "@/lib/types";

// Role hierarchy for privilege-escalation checks
export const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.SuperAdmin]: 5,
  [Role.TenantAdmin]: 4,
  [Role.ProductAdmin]: 3,
  [Role.TeamAdmin]: 2,
  [Role.Agent]: 1,
};

/**
 * Users can only manage (create / modify / delete) roles strictly lower
 * than their own.
 */
export function canManageRole(currentRole: Role, targetRole: Role): boolean {
  return ROLE_HIERARCHY[currentRole] > ROLE_HIERARCHY[targetRole];
}

export function isSuperAdmin(role: Role): boolean {
  return role === Role.SuperAdmin;
}
