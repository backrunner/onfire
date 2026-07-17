import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationEndpointRow } from "@/drizzle/schema";

const { createChannel } = vi.hoisted(() => ({ createChannel: vi.fn() }));

vi.mock("@/lib/db", () => ({
  getEnv: () => ({ AUTH_SECRET: "test-secret" }),
}));

vi.mock("./channels", () => ({ createChannel }));

import { sendEndpointTest } from "./test-endpoint";

const endpoint = (overrides: Partial<NotificationEndpointRow> = {}) =>
  ({
    id: "endpoint-1",
    userId: "user-1",
    channelType: "ntfy",
    name: "On call",
    enabled: true,
    config: JSON.stringify({ topic: "onfire-alerts" }),
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  }) satisfies NotificationEndpointRow;

describe("sendEndpointTest", () => {
  beforeEach(() => {
    createChannel.mockReset();
  });

  it("opens the stored config and sends a provider test message", async () => {
    const send = vi.fn().mockResolvedValue({ success: true });
    createChannel.mockResolvedValue({ name: "ntfy", send });

    const result = await sendEndpointTest({} as never, endpoint());

    expect(result).toEqual({ success: true });
    expect(createChannel).toHaveBeenCalledWith(
      { type: "ntfy", config: { topic: "onfire-alerts" } },
      { db: {}, productId: "" }
    );
    expect(send).toHaveBeenCalledWith({
      title: "OnFire test notification",
      body: "Your receiving method is configured correctly.",
    });
  });

  it("requires product context for email delivery", async () => {
    const result = await sendEndpointTest(
      {} as never,
      endpoint({ channelType: "email", config: JSON.stringify({ email: "agent@example.com" }) })
    );

    expect(result).toEqual({
      success: false,
      error: "A product is required to test an email endpoint",
    });
    expect(createChannel).not.toHaveBeenCalled();
  });

  it("returns provider failures without throwing", async () => {
    createChannel.mockResolvedValue({
      name: "ntfy",
      send: vi.fn().mockResolvedValue({ success: false, error: "provider rejected" }),
    });

    await expect(sendEndpointTest({} as never, endpoint())).resolves.toEqual({
      success: false,
      error: "provider rejected",
    });
  });
});
