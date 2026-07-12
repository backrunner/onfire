import { describe, expect, it } from "vitest";
import { safeHttpUrl, safePublicHttpUrl } from "@/lib/external-url";

describe("safeHttpUrl", () => {
  it("accepts normalized HTTP and HTTPS destinations", () => {
    expect(safeHttpUrl("https://product.example.com/support")).toBe(
      "https://product.example.com/support"
    );
    expect(safeHttpUrl("http://localhost:3000/account")).toBe(
      "http://localhost:3000/account"
    );
  });

  it("rejects executable, opaque, and malformed URLs", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,hello")).toBeNull();
    expect(safeHttpUrl("/relative/path")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl("https://user:pass@example.com/return")).toBeNull();
  });

  it("handles missing values", () => {
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
  });
});

describe("safePublicHttpUrl", () => {
  it("accepts public HTTPS destinations", () => {
    expect(safePublicHttpUrl("https://hooks.example.com/path")).toBe(
      "https://hooks.example.com/path"
    );
  });

  it("rejects local, private, and non-HTTPS destinations", () => {
    expect(safePublicHttpUrl("http://hooks.example.com/path")).toBeNull();
    expect(safePublicHttpUrl("https://localhost/hook")).toBeNull();
    expect(safePublicHttpUrl("https://127.0.0.1/hook")).toBeNull();
    expect(safePublicHttpUrl("https://192.168.1.10/hook")).toBeNull();
    expect(safePublicHttpUrl("https://service.internal/hook")).toBeNull();
    expect(safePublicHttpUrl("https://user:pass@example.com/hook")).toBeNull();
  });
});
