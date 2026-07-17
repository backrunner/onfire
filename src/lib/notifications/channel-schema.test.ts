import { describe, expect, it } from "vitest";
import {
  openEndpointConfig,
  sealEndpointConfig,
  toEndpointView,
  validateChannelConfig,
} from "./channel-schema";
import type { NotificationEndpointRow } from "@/drizzle/schema";

describe("notification endpoint views", () => {
  it("omits configured secrets while reporting their presence", () => {
    const row = {
      id: "channel-1",
      userId: "user-1",
      channelType: "discord",
      name: "Alerts",
      enabled: true,
      config: JSON.stringify({
        webhookUrl: "https://discord.example/hook-secret",
        label: "keep me",
      }),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as NotificationEndpointRow;

    const view = toEndpointView(row);
    expect(view.config).toEqual({ label: "keep me" });
    expect(view.secretFields).toEqual(["webhookUrl"]);
    expect(JSON.stringify(view)).not.toContain("hook-secret");
  });

  it("seals provider credentials while preserving ordinary config", async () => {
    const sealed = await sealEndpointConfig(
      "channel-1",
      { webhookUrl: "https://discord.example/secret", label: "alerts" },
      "master"
    );
    expect(sealed.webhookUrl).toMatch(/^v1\./);
    expect(sealed.webhookUrl).not.toContain("secret");
    await expect(
      openEndpointConfig("channel-1", sealed, "master")
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
    for (const type of ["slack", "teams", "feishu", "dingtalk", "wecom"]) {
      expect(
        validateChannelConfig(type, {
          webhookUrl: "https://hooks.example.com/secret",
        })
      ).toEqual([]);
    }
    expect(
      validateChannelConfig("feishu", {
        webhookUrl: "https://hooks.example.com/secret",
        signingSecret: "secret",
      })
    ).toEqual([]);
  });
});
