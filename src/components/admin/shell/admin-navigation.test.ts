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
    expect(isAdminNavItemActive("/admin/emailing", "/admin/email")).toBe(false);
  });
});
