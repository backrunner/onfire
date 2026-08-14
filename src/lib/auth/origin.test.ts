import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getEnv: () => ({ BETTER_AUTH_URL: "https://admin.example.com" }),
}));

import { assertCanonicalTobOrigin } from "./origin";

describe("canonical ToB mutation origin", () => {
  it("accepts only the exact canonical origin", () => {
    expect(() =>
      assertCanonicalTobOrigin(
        new Request("https://admin.example.com/api/tob/oauth/grants/grant-1", {
          headers: { Origin: "https://admin.example.com" },
        }),
        "connected-application revocation",
      ),
    ).not.toThrow();
  });

  it.each([
    null,
    "null",
    "https://attacker.example",
    "https://admin.example.com/path",
    "https://admin.example.com?query=1",
  ])("rejects a noncanonical origin: %s", (origin) => {
    const headers = new Headers();
    if (origin !== null) headers.set("origin", origin);

    expect(() =>
      assertCanonicalTobOrigin(
        new Request("https://admin.example.com/api/tob/oauth/grants/grant-1", {
          headers,
        }),
        "connected-application revocation",
      ),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });
});
