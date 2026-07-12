import { describe, expect, it } from "vitest";
import {
  isTocProxyAllowedOnSurface,
  rewriteTocProxyRequest,
  rewriteTocProxyResponse,
  stripTocProxyPrefix,
} from "@/lib/toc-proxy";

describe("ToC /support proxy contract", () => {
  it("allows only build assets below /support on the ToB hostname", () => {
    expect(isTocProxyAllowedOnSurface("/_next/static/app.js", "tob")).toBe(true);
    expect(isTocProxyAllowedOnSurface("/api/toc/tickets", "tob")).toBe(false);
    expect(isTocProxyAllowedOnSurface("/tickets/abc", "tob")).toBe(false);
    expect(isTocProxyAllowedOnSurface("/sw.js", "tob")).toBe(false);
    expect(isTocProxyAllowedOnSurface("/api/toc/tickets", "toc")).toBe(true);
  });

  it("maps only customer pages, customer APIs, and isolated assets", () => {
    expect(stripTocProxyPrefix("/support")).toBe("/");
    expect(stripTocProxyPrefix("/support/tickets/abc")).toBe("/tickets/abc");
    expect(stripTocProxyPrefix("/support/api/toc/whoami")).toBe(
      "/api/toc/whoami"
    );
    expect(stripTocProxyPrefix("/support/_next/static/chunk.js")).toBe(
      "/_next/static/chunk.js"
    );
    expect(stripTocProxyPrefix("/support/admin")).toBeNull();
    expect(stripTocProxyPrefix("/support/api/tob/me")).toBeNull();
    expect(stripTocProxyPrefix("/other")).toBeNull();
  });

  it("preserves method and body while rewriting the upstream path", async () => {
    const request = new Request(
      "https://product.example.com/support/api/toc/identity/exchange?q=1",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credential: "opaque" }),
      }
    );
    const rewritten = rewriteTocProxyRequest(request);
    expect(rewritten?.url).toBe(
      "https://product.example.com/api/toc/identity/exchange?q=1"
    );
    expect(rewritten?.method).toBe("POST");
    expect(rewritten?.headers.get("x-onfire-proxy-prefix")).toBe("/support");
    await expect(rewritten?.json()).resolves.toEqual({ credential: "opaque" });
  });

  it("keeps redirects and service worker scope inside /support", () => {
    const request = new Request("https://product.example.com/support/sw.js");
    const response = rewriteTocProxyResponse(
      request,
      new Response(null, {
        status: 307,
        headers: { location: "https://product.example.com/tickets/1" },
      })
    );
    expect(response.headers.get("location")).toBe(
      "https://product.example.com/support/tickets/1"
    );
    expect(response.headers.get("service-worker-allowed")).toBe("/support/");
  });
});
