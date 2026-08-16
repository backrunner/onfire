import { describe, expect, it } from "vitest";
import { isAdminNavItemActive } from "./admin-navigation";

describe("admin sidebar navigation", () => {
  it("selects Dashboard for the admin page and rewritten admin-domain root", () => {
    expect(isAdminNavItemActive("/admin", "/admin", true)).toBe(true);
    expect(isAdminNavItemActive("/admin/", "/admin", true)).toBe(true);
    expect(isAdminNavItemActive("/", "/admin", true)).toBe(true);
  });

  it("keeps exact and nested navigation matches on path boundaries", () => {
    expect(isAdminNavItemActive("/admin/tickets/123", "/admin/tickets")).toBe(
      true
    );
    expect(isAdminNavItemActive("/admin/tickets", "/admin", true)).toBe(false);
    expect(isAdminNavItemActive("/admin/notifications-archive", "/admin/notifications")).toBe(false);
    expect(
      isAdminNavItemActive("/admin/management/tenants/t1", "/admin/management")
    ).toBe(true);
    expect(
      isAdminNavItemActive("/admin/management/products/p1", "/admin/management")
    ).toBe(true);
  });
});
