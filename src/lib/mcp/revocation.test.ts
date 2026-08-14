import { describe, expect, it } from "vitest";
import { normalizeMcpRevocationResponse } from "./revocation";

describe("MCP OAuth token revocation response", () => {
  it.each([
    "Invalid access token",
    "opaque access token not found",
    "refresh token revoked",
    "token not found",
  ])("silently accepts an invalid token: %s", async (errorDescription) => {
    const response = await normalizeMcpRevocationResponse(
      Response.json(
        { error: "invalid_request", error_description: errorDescription },
        { status: 400 },
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.text()).resolves.toBe("");
  });

  it.each([
    { error: "invalid_client", error_description: "invalid client" },
    { error: "unsupported_token_type", error_description: "unsupported" },
    { error: "invalid_request", error_description: "missing token" },
  ])("preserves non-token errors: $error", async (payload) => {
    const original = Response.json(payload, { status: 400 });
    const response = await normalizeMcpRevocationResponse(original);

    expect(response).toBe(original);
    expect(response.status).toBe(400);
  });
});
