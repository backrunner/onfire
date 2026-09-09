import { describe, expect, it } from "vitest";
import { classifySurface, isApiAllowedOnSurface } from "@/lib/surface-routing";

describe("surface routing", () => {
  it("classifies configured domains and development ports", () => {
    expect(
      classifySurface("admin.example.com", {
        adminDomains: "admin.example.com",
        tocDomains: "support.example.com",
      })
    ).toBe("tob");
    expect(
      classifySurface("support.example.com", {
        adminDomains: "admin.example.com",
        tocDomains: "support.example.com",
      })
    ).toBe("toc");
    expect(classifySurface("localhost:3001", { development: true })).toBe("tob");
    expect(classifySurface("localhost:3000", { development: true })).toBe("toc");
  });

  it("uses the production ToB and ToC hostnames by default", () => {
    expect(classifySurface("admin.example.com")).toBe("tob");
    expect(classifySurface("support.example.com")).toBe("toc");
  });

  it("defaults unknown hosts to ToC but never exposes the other API surface", () => {
    expect(classifySurface("product.example.com")).toBe("toc");
    expect(isApiAllowedOnSurface("/api/tob/install", "toc")).toBe(false);
    expect(isApiAllowedOnSurface("/api/toc/health", "toc")).toBe(true);
    expect(isApiAllowedOnSurface("/api/toc/health", "tob")).toBe(false);
    expect(isApiAllowedOnSurface("/admin", "toc")).toBe(true);
  });

  it("keeps MCP and OAuth discovery on the ToB surface", () => {
    const protectedPaths = [
      "/mcp",
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
      "/.well-known/oauth-authorization-server/api/tob/auth",
    ];
    for (const pathname of protectedPaths) {
      expect(isApiAllowedOnSurface(pathname, "tob")).toBe(true);
      expect(isApiAllowedOnSurface(pathname, "toc")).toBe(false);
    }
  });

  it.each([
    "/api%2Ftob/install",
    "/api%252Ftob/install",
    "/api/toc%2F..%2Ftob/install",
    "/mcp%2Ftools",
    "/.well-known%2Foauth-authorization-server%2Fapi%2Ftob%2Fauth",
  ])("keeps encoded ToB path %s off the ToC surface", (pathname) => {
    expect(isApiAllowedOnSurface(pathname, "toc")).toBe(false);
  });

  it.each([
    "/api%2Ftoc/health",
    "/api%252Ftoc/health",
    "/api/tob%2F..%2Ftoc/health",
  ])("keeps encoded ToC path %s off the ToB surface", (pathname) => {
    expect(isApiAllowedOnSurface(pathname, "tob")).toBe(false);
  });

  it("rejects malformed encoded paths before downstream routing", () => {
    expect(isApiAllowedOnSurface("/api%ZZtob/install", "toc")).toBe(false);
    expect(isApiAllowedOnSurface("/api%ZZtoc/health", "tob")).toBe(false);
  });
});
