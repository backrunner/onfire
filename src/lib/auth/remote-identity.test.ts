import { describe, expect, it, vi } from "vitest";
import {
  RemoteIdentityRejectedError,
  resolveRemoteCustomerIdentity,
  safeIdentityEndpoint,
} from "@/lib/auth/remote-identity";

describe("remote customer identity", () => {
  it("accepts only public-looking HTTPS resolver URLs", () => {
    expect(safeIdentityEndpoint("https://id.example.com/onfire")?.href).toBe(
      "https://id.example.com/onfire"
    );
    for (const value of [
      "http://id.example.com/onfire",
      "https://localhost/onfire",
      "https://127.0.0.1/onfire",
      "https://[::1]/onfire",
      "https://id.example.com:8443/onfire",
      "https://user:pass@id.example.com/onfire",
      "https://service.internal/onfire",
    ]) {
      expect(safeIdentityEndpoint(value), value).toBeNull();
    }
  });

  it("sends the opaque credential and server secret using the v1 contract", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer server-secret"
      );
      expect(new Headers(init?.headers).get("x-onfire-identity-protocol")).toBe(
        "onfire-userinfo-v1"
      );
      expect(JSON.parse(String(init?.body))).toEqual({
        credential: "opaque-browser-credential",
        productId: "product-1",
      });
      return Response.json(
        { externalId: "customer-7", email: "user@example.com", level: 42 },
        { headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;

    await expect(
      resolveRemoteCustomerIdentity(
        {
          endpointUrl: "https://id.example.com/onfire",
          authSecret: "server-secret",
          productId: "product-1",
          credential: "opaque-browser-credential",
        },
        fetchImpl
      )
    ).resolves.toMatchObject({ externalId: "customer-7", level: 42 });
  });

  it("rejects redirects, auth failures, and oversized responses", async () => {
    const input = {
      endpointUrl: "https://id.example.com/onfire",
      authSecret: "server-secret",
      productId: "product-1",
      credential: "opaque-browser-credential",
    };
    await expect(
      resolveRemoteCustomerIdentity(
        input,
        (async () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://other.example.com" },
          })) as typeof fetch
      )
    ).rejects.toThrow("redirects are not allowed");
    await expect(
      resolveRemoteCustomerIdentity(
        input,
        (async () => new Response(null, { status: 401 })) as typeof fetch
      )
    ).rejects.toBeInstanceOf(RemoteIdentityRejectedError);
    await expect(
      resolveRemoteCustomerIdentity(
        input,
        (async () =>
          new Response(JSON.stringify({ externalId: "x", padding: "x".repeat(70_000) }), {
            headers: { "content-type": "application/json" },
          })) as typeof fetch
      )
    ).rejects.toThrow("too large");
  });
});
