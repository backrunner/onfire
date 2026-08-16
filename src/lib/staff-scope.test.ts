import { describe, expect, it } from "vitest";
import { Role } from "@/lib/types";
import { parseStaffScope } from "./staff-scope";
import {
  canAccessManagement,
  canViewTenantConfiguration,
  managementEntryHref,
} from "./staff-access";

describe("staff scope parsing", () => {
  it("uses an explicit scope when provided", () => {
    expect(parseStaffScope({ scope: "tenant", tenantId: "t1" })).toEqual({
      scope: "tenant",
      tenantId: "t1",
      productId: undefined,
    });
  });

  it("infers product, tenant, then system", () => {
    expect(parseStaffScope({ productId: "p1" }).scope).toBe("product");
    expect(parseStaffScope({ tenantId: "t1" }).scope).toBe("tenant");
    expect(parseStaffScope({}).scope).toBe("system");
  });
});

describe("management entry", () => {
  it("limits configuration to SuperAdmin, TenantAdmin, and ProductAdmin", () => {
    expect(canAccessManagement(Role.SuperAdmin)).toBe(true);
    expect(canAccessManagement(Role.TenantAdmin)).toBe(true);
    expect(canAccessManagement(Role.ProductAdmin)).toBe(true);
    expect(canAccessManagement(Role.TeamAdmin)).toBe(false);
    expect(canAccessManagement(Role.Agent)).toBe(false);
  });

  it("routes each role to its own configuration landing", () => {
    expect(
      managementEntryHref({
        role: Role.SuperAdmin,
        user: { tenantId: "t1" },
        productIds: [],
      })
    ).toBe("/admin/management");
    expect(
      managementEntryHref({
        role: Role.TenantAdmin,
        user: { tenantId: "t1" },
        productIds: [],
      })
    ).toBe("/admin/management/tenants/t1");
    expect(
      managementEntryHref({
        role: Role.ProductAdmin,
        user: { tenantId: "t1" },
        productIds: ["p1"],
      })
    ).toBe("/admin/management/products/p1");
    expect(
      managementEntryHref({
        role: Role.ProductAdmin,
        user: { tenantId: "t1" },
        productIds: ["p1", "p2"],
      })
    ).toBe("/admin/management");
    expect(
      managementEntryHref({
        role: Role.ProductAdmin,
        user: { tenantId: "t1" },
        productIds: [],
      })
    ).toBeNull();
    expect(
      managementEntryHref({
        role: Role.TeamAdmin,
        user: { tenantId: "t1" },
        productIds: [],
      })
    ).toBeNull();
  });

  it("keeps tenant configuration SuperAdmin or owning TenantAdmin only", () => {
    expect(
      canViewTenantConfiguration(
        { role: Role.SuperAdmin, user: { tenantId: "sys" }, productIds: [] },
        "t1"
      )
    ).toBe(true);
    expect(
      canViewTenantConfiguration(
        { role: Role.TenantAdmin, user: { tenantId: "t1" }, productIds: [] },
        "t1"
      )
    ).toBe(true);
    expect(
      canViewTenantConfiguration(
        { role: Role.TenantAdmin, user: { tenantId: "t1" }, productIds: [] },
        "t2"
      )
    ).toBe(false);
    expect(
      canViewTenantConfiguration(
        { role: Role.ProductAdmin, user: { tenantId: "t1" }, productIds: ["p1"] },
        "t1"
      )
    ).toBe(false);
  });
});
