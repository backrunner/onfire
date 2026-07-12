import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function request(path: string, host: string) {
  return new NextRequest(`https://${host}${path}`, {
    headers: { host },
  });
}

function proxiedRequest(path: string, host: string) {
  return new NextRequest(`https://${host}${path}`, {
    headers: { host, "x-onfire-proxy-prefix": "/support" },
  });
}

describe("multi-domain middleware", () => {
  it("rewrites admin-domain pages under /admin", () => {
    const response = middleware(request("/tickets", "onfire.alkinum.com"));

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://onfire.alkinum.com/admin/tickets"
    );
  });

  it("keeps existing admin paths unchanged", () => {
    const response = middleware(
      request("/admin/tickets", "onfire.alkinum.com")
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects admin paths away from the customer domain", () => {
    const response = middleware(
      request("/admin/tickets", "support.alkinum.io")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://support.alkinum.io/");
  });

  it("bypasses APIs and static files", () => {
    expect(
      middleware(request("/api/tob/health", "onfire.alkinum.com")).headers.get(
        "x-middleware-next"
      )
    ).toBe("1");
    expect(
      middleware(request("/icon.svg", "onfire.alkinum.com")).headers.get(
        "x-middleware-next"
      )
    ).toBe("1");
  });

  it("does not accept lookalike admin domains", () => {
    const response = middleware(
      request("/tickets", "onfire.alkinum.com.attacker.example")
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("keeps worker-validated /support requests on the ToC surface", () => {
    const response = middleware(proxiedRequest("/", "onfire.alkinum.com"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
