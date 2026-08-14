import { describe, expect, it } from "vitest";
import {
  availableMcpPermissions,
  effectiveMcpPermissions,
  isMcpPermission,
  MCP_PERMISSION_IDS,
} from "./permissions";
import { Role } from "@/lib/types";

describe("MCP permission mapping", () => {
  it("offers every MCP capability to a SuperAdmin", () => {
    expect(availableMcpPermissions(Role.SuperAdmin)).toEqual(
      MCP_PERMISSION_IDS,
    );
  });

  it("does not offer product settings to team-scoped roles", () => {
    const permissions = availableMcpPermissions(Role.TeamAdmin);
    expect(permissions).toContain("tickets:read");
    expect(permissions).toContain("tickets:reassign");
    expect(permissions).not.toContain("settings:read");
    expect(permissions).not.toContain("settings:write");
  });

  it("recomputes effective grants against the user's current role", () => {
    expect(
      effectiveMcpPermissions(Role.Agent, [
        "tickets:read",
        "tickets:reassign",
        "settings:write",
        "unknown:permission",
      ]),
    ).toEqual(["tickets:read"]);
  });

  it("accepts only declared atomic permission identifiers", () => {
    expect(isMcpPermission("tickets:reply")).toBe(true);
    expect(isMcpPermission("ticket.write")).toBe(false);
    expect(isMcpPermission("settings:delete")).toBe(false);
  });
});
