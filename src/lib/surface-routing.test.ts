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
    expect(classifySurface("onfire.alkinum.com")).toBe("tob");
    expect(classifySurface("support.alkinum.io")).toBe("toc");
  });

  it("defaults unknown hosts to ToC but never exposes the other API surface", () => {
    expect(classifySurface("product.example.com")).toBe("toc");
    expect(isApiAllowedOnSurface("/api/tob/install", "toc")).toBe(false);
    expect(isApiAllowedOnSurface("/api/toc/health", "toc")).toBe(true);
    expect(isApiAllowedOnSurface("/api/toc/health", "tob")).toBe(false);
    expect(isApiAllowedOnSurface("/admin", "toc")).toBe(true);
  });
});
