import { describe, expect, it } from "vitest";
import { readResponseJson, readResponseText } from "@/lib/response-body";

describe("bounded upstream responses", () => {
  it("parses JSON within the configured limit", async () => {
    await expect(
      readResponseJson<{ ok: boolean }>(Response.json({ ok: true }), 64)
    ).resolves.toEqual({ ok: true });
  });

  it("rejects declared and streamed responses over the limit", async () => {
    await expect(
      readResponseText(
        new Response("small", { headers: { "content-length": "100" } }),
        10
      )
    ).rejects.toThrow(/too large/);

    await expect(readResponseText(new Response("0123456789"), 5)).rejects.toThrow(
      /too large/
    );
  });
});
