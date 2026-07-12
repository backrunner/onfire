import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { clientIp } from "./rate-limit";

describe("client IP extraction", () => {
  it("uses Cloudflare's edge header and ignores forged forwarding headers", () => {
    const request = new NextRequest("https://support.example/api", {
      headers: {
        "x-forwarded-for": "198.51.100.7",
        "cf-connecting-ip": "203.0.113.8",
      },
    });
    expect(clientIp(request)).toBe("203.0.113.8");
  });

  it("does not trust X-Forwarded-For when Cloudflare metadata is absent", () => {
    const request = new NextRequest("https://support.example/api", {
      headers: { "x-forwarded-for": "198.51.100.7" },
    });
    expect(clientIp(request)).toBe("unknown");
  });
});
