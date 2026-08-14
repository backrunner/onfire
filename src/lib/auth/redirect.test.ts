import { describe, expect, it } from "vitest";
import { safeSameOriginRedirect } from "./redirect";

describe("safeSameOriginRedirect", () => {
  it("preserves relative and absolute same-origin OAuth continuations", () => {
    expect(
      safeSameOriginRedirect(
        "/admin/oauth/authorize?client_id=client-1#consent",
        "https://admin.example.com",
      ),
    ).toBe("/admin/oauth/authorize?client_id=client-1#consent");
    expect(
      safeSameOriginRedirect(
        "https://admin.example.com/admin/oauth/authorize?client_id=client-1",
        "https://admin.example.com",
      ),
    ).toBe("/admin/oauth/authorize?client_id=client-1");
  });

  it.each([
    "https://attacker.example/callback",
    "//attacker.example/callback",
    "javascript:alert(1)",
    "data:text/html,malicious",
    "https://user:password@admin.example.com/admin",
  ])("rejects unsafe sign-in redirect %s", (value) => {
    expect(
      safeSameOriginRedirect(value, "https://admin.example.com"),
    ).toBe("/admin");
  });

  it("uses the fallback for malformed response data or origin", () => {
    expect(safeSameOriginRedirect({ url: "/admin" }, "https://admin.example.com"))
      .toBe("/admin");
    expect(safeSameOriginRedirect("/admin", "not a URL")).toBe("/admin");
  });
});
