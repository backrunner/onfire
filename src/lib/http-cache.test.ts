import { describe, expect, it } from "vitest";
import { withNoStore, withNoStoreHandler } from "./http-cache";

describe("sensitive response cache policy", () => {
  it("preserves response metadata while forcing no-store", async () => {
    const response = withNoStore(
      new Response("payload", {
        status: 401,
        statusText: "Unauthorized",
        headers: {
          "Cache-Control": "public, max-age=300",
          "Set-Cookie": "session=deleted; Path=/; HttpOnly",
          "X-Test": "kept",
        },
      }),
    );

    expect(response.status).toBe(401);
    expect(response.statusText).toBe("Unauthorized");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("set-cookie")).toContain("session=deleted");
    expect(response.headers.get("x-test")).toBe("kept");
    await expect(response.text()).resolves.toBe("payload");
  });

  it("wraps both successful and failed handler responses", async () => {
    const handler = withNoStoreHandler(async (status: number) =>
      Response.json({ status }, { status }),
    );

    for (const status of [200, 403]) {
      const response = await handler(status);
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("pragma")).toBe("no-cache");
    }
  });
});
