import { describe, it, expect } from "vitest";
import { rolePermissions, hasPermission, Role } from "@/lib/types";

/**
 * The role hierarchy implies permission subsets: every lower role's
 * permissions must be a subset of TenantAdmin's, and TenantAdmin's a subset
 * of SuperAdmin's (minus tenant.manage which is SuperAdmin-only).
 */
describe("RBAC permission matrix", () => {
  it("SuperAdmin is a superset of every other role", () => {
    const superPerms = new Set(rolePermissions[Role.SuperAdmin]);
    for (const role of [
      Role.TenantAdmin,
      Role.ProductAdmin,
      Role.TeamAdmin,
      Role.Agent,
    ]) {
      for (const perm of rolePermissions[role]) {
        expect(superPerms.has(perm), `${role} has ${perm} not in SuperAdmin`).toBe(true);
      }
    }
  });

  it("only SuperAdmin can manage tenants", () => {
    expect(hasPermission(Role.SuperAdmin, "tenant.manage")).toBe(true);
    expect(hasPermission(Role.TenantAdmin, "tenant.manage")).toBe(false);
    expect(hasPermission(Role.ProductAdmin, "tenant.manage")).toBe(false);
  });

  it("agents cannot assign, escalate or reassign", () => {
    expect(hasPermission(Role.Agent, "ticket.assign")).toBe(false);
    expect(hasPermission(Role.Agent, "ticket.escalate")).toBe(false);
    expect(hasPermission(Role.Agent, "ticket.reassign")).toBe(false);
  });

  it("agents can read, write and close tickets", () => {
    expect(hasPermission(Role.Agent, "ticket.read")).toBe(true);
    expect(hasPermission(Role.Agent, "ticket.write")).toBe(true);
    expect(hasPermission(Role.Agent, "ticket.close")).toBe(true);
  });

  it("TeamAdmin cannot manage templates or products", () => {
    expect(hasPermission(Role.TeamAdmin, "template.write")).toBe(false);
    expect(hasPermission(Role.TeamAdmin, "product.manage")).toBe(false);
  });

  it("user management stops at TenantAdmin", () => {
    expect(hasPermission(Role.TenantAdmin, "user.manage")).toBe(true);
    expect(hasPermission(Role.ProductAdmin, "user.manage")).toBe(false);
  });
});
