import { describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";

type TestHandler = (
  request: NextRequest,
  context: Record<string, never>,
) => Promise<NextResponse>;

vi.mock("@/lib/api/handler", () => ({
  withAuth:
    (_options: unknown, handler: TestHandler) => (request: NextRequest) =>
      request.headers.get("x-test-auth") === "deny"
        ? Response.json({ error: "Unauthorized" }, { status: 401 })
        : handler(request, {}),
}));

import { GET } from "./route";

describe("connected MCP applications list", () => {
  it("forces no-store on authentication failures", async () => {
    const response = await GET(
      new NextRequest("https://admin.example.com/api/tob/oauth/grants", {
        headers: { "x-test-auth": "deny" },
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });
});
