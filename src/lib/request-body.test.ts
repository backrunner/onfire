import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { readBodyBytes } from "@/lib/request-body";
import { parseBody } from "@/lib/api/handler";
import { z } from "zod";

describe("bounded request bodies", () => {
  it("reads a body up to the configured byte limit", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      body: "hello",
    });

    const body = await readBodyBytes(request, 5);
    expect(new TextDecoder().decode(body)).toBe("hello");
  });

  it("rejects an oversized declared content length before reading", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      headers: { "content-length": "100" },
      body: "small",
    });

    await expect(readBodyBytes(request, 10)).rejects.toMatchObject({
      status: 413,
    });
  });

  it("rejects a streamed body that exceeds the limit", async () => {
    const request = new Request("https://example.com/webhook", {
      method: "POST",
      body: "sixsix",
    });

    await expect(readBodyBytes(request, 5)).rejects.toMatchObject({
      status: 413,
    });
  });

  it("returns a 413 when parseBody receives oversized JSON", async () => {
    const request = new NextRequest("https://example.com/api", {
      method: "POST",
      body: JSON.stringify({ value: "123456" }),
      headers: { "content-type": "application/json" },
    });

    await expect(
      parseBody(request, z.object({ value: z.string() }), 10)
    ).rejects.toMatchObject({ status: 413 });
  });
});
