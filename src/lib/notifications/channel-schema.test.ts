import { describe, expect, it } from "vitest";
import {
  openChannelConfig,
  sealChannelConfig,
  toChannelView,
  validateChannelConfig,
} from "./channel-schema";
import type { NotificationChannelRow } from "@/drizzle/schema";

describe("notification channel views", () => {
  it("omits configured secrets while reporting their presence", () => {
    const row = {
      id: "channel-1",
      productId: "product-1",
      channelType: "discord",
      name: "Alerts",
      enabled: true,
      config: JSON.stringify({
        webhookUrl: "https://discord.example/hook-secret",
        label: "keep me",
      }),
      triggerEvents: JSON.stringify(["ticket_created"]),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as NotificationChannelRow;

    const view = toChannelView(row);
    expect(view.config).toEqual({ label: "keep me" });
    expect(view.secretFields).toEqual(["webhookUrl"]);
    expect(JSON.stringify(view)).not.toContain("hook-secret");
  });

  it("seals provider credentials while preserving ordinary config", async () => {
    const sealed = await sealChannelConfig(
      "channel-1",
      { webhookUrl: "https://discord.example/secret", label: "alerts" },
      "master"
    );
    expect(sealed.webhookUrl).toMatch(/^v1\./);
    expect(sealed.webhookUrl).not.toContain("secret");
    await expect(
      openChannelConfig("channel-1", sealed, "master")
    ).resolves.toEqual({
      webhookUrl: "https://discord.example/secret",
      label: "alerts",
    });
  });

  it("validates provider-specific fields and permits sealed edits", () => {
    expect(
      validateChannelConfig("pushdeer", {
        pushkey: "push-key",
        serverUrl: "https://push.example.com",
      })
    ).toEqual([]);
    expect(
      validateChannelConfig("pushdeer", {
        pushkey: "push-key",
        serverUrl: "javascript:alert(1)",
      })
    ).not.toEqual([]);
    expect(
      validateChannelConfig("ntfy", {
        topic: "support",
        serverUrl: "https://ntfy.example.com/path?redirect=1",
      })
    ).not.toEqual([]);
    expect(
      validateChannelConfig("discord", {
        webhookUrl: "v1.iv.ciphertext",
      })
    ).toEqual([]);
    expect(
      validateChannelConfig("telegram", {
        botToken: "token with spaces",
        chatId: "123",
      })
    ).toEqual([]);
    expect(
      validateChannelConfig("telegram", {
        botToken: "token with spaces",
        chatId: "123/unsafe",
      })
    ).not.toEqual([]);
  });
});
