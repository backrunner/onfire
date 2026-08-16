import { describe, expect, it } from "vitest";
import { Role } from "@/lib/types";
import { canStartPreview } from "./api-utils";
import {
  assertCanPreview,
  isPreviewControlPath,
  isWriteMethod,
  sealPreviewCookie,
  verifyPreviewCookie,
  type PreviewActor,
} from "./preview-identity";

const secret = "preview-test-secret";

function actor(role: Role, id = "admin-1", tenantIds = ["t1"]): PreviewActor {
  return {
    isSuperAdmin: role === Role.SuperAdmin,
    role,
    user: { id },
    tenantIds: role === Role.SuperAdmin ? [] : tenantIds,
  };
}

describe("preview identity authorization", () => {
  it("allows SuperAdmin and TenantAdmin to start preview", () => {
    expect(canStartPreview(Role.SuperAdmin)).toBe(true);
    expect(canStartPreview(Role.TenantAdmin)).toBe(true);
    expect(canStartPreview(Role.ProductAdmin)).toBe(false);
    expect(canStartPreview(Role.Agent)).toBe(false);
  });

  it("lets SuperAdmin preview any lower role", () => {
    expect(() =>
      assertCanPreview(actor(Role.SuperAdmin), {
        id: "u2",
        role: Role.TenantAdmin,
        tenantId: "t9",
      })
    ).not.toThrow();
  });

  it("keeps TenantAdmin inside their tenant and below their role", () => {
    expect(() =>
      assertCanPreview(actor(Role.TenantAdmin), {
        id: "u2",
        role: Role.ProductAdmin,
        tenantId: "t1",
      })
    ).not.toThrow();
    expect(() =>
      assertCanPreview(actor(Role.TenantAdmin), {
        id: "u2",
        role: Role.ProductAdmin,
        tenantId: "t2",
      })
    ).toThrow();
    expect(() =>
      assertCanPreview(actor(Role.TenantAdmin), {
        id: "u2",
        role: Role.TenantAdmin,
        tenantId: "t1",
      })
    ).toThrow();
  });

  it("rejects self preview and ProductAdmin actors", () => {
    expect(() =>
      assertCanPreview(actor(Role.SuperAdmin, "u1"), {
        id: "u1",
        role: Role.Agent,
        tenantId: "t1",
      })
    ).toThrow();
    expect(() =>
      assertCanPreview(actor(Role.ProductAdmin), {
        id: "u2",
        role: Role.Agent,
        tenantId: "t1",
      })
    ).toThrow();
  });
});

describe("preview cookie", () => {
  it("round-trips a valid payload", async () => {
    const payload = {
      actorId: "a1",
      targetUserId: "t1",
      exp: Math.floor(Date.now() / 1000) + 60,
    };
    const cookie = await sealPreviewCookie(payload, secret);
    expect(await verifyPreviewCookie(cookie, secret)).toEqual(payload);
  });

  it("rejects tampering, expiry, and missing secrets", async () => {
    const cookie = await sealPreviewCookie(
      {
        actorId: "a1",
        targetUserId: "t1",
        exp: Math.floor(Date.now() / 1000) + 60,
      },
      secret
    );
    expect(await verifyPreviewCookie(`${cookie}x`, secret)).toBeNull();
    expect(await verifyPreviewCookie(cookie, "other-secret")).toBeNull();
    expect(await verifyPreviewCookie(cookie, "")).toBeNull();
    expect(
      await verifyPreviewCookie(
        await sealPreviewCookie(
          {
            actorId: "a1",
            targetUserId: "t1",
            exp: Math.floor(Date.now() / 1000) - 1,
          },
          secret
        ),
        secret
      )
    ).toBeNull();
  });
});

describe("preview request guards", () => {
  it("recognizes the control path and write methods", () => {
    expect(isPreviewControlPath("/api/tob/preview")).toBe(true);
    expect(isPreviewControlPath("/api/tob/preview/")).toBe(true);
    expect(isPreviewControlPath("/api/tob/me")).toBe(false);
    expect(isWriteMethod("POST")).toBe(true);
    expect(isWriteMethod("GET")).toBe(false);
  });
});
