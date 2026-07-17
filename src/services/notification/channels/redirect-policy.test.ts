import { afterEach, describe, expect, it, vi } from "vitest";
import { BarkChannel } from "./bark";
import { DiscordChannel } from "./discord";
import { NtfyChannel } from "./ntfy";
import { PushdeerChannel } from "./pushdeer";
import { TelegramChannel } from "./telegram";

const message = { title: "Ticket assigned", body: "Please review ticket #1" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notification redirect policy", () => {
  it("rejects redirects for every configurable HTTP notification channel", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ code: 0 }))
      .mockResolvedValueOnce(Response.json({ code: 200 }))
      .mockResolvedValueOnce(new Response("ok"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await new PushdeerChannel("push-key").send(message);
    await new BarkChannel("https://api.day.app", "device-key").send(message);
    await new NtfyChannel("https://ntfy.sh", "support").send(message);
    await new DiscordChannel("https://discord.example/webhook").send(message);
    await new TelegramChannel("bot-token", "chat-id").send(message);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit | undefined)?.redirect).toBe("error");
    }
  });
});
