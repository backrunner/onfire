import { afterEach, describe, expect, it, vi } from "vitest";
import { SlackChannel } from "./slack";
import { TeamsChannel } from "./teams";
import { FeishuChannel } from "./feishu";
import { DingTalkChannel } from "./dingtalk";
import { WeComChannel } from "./wecom";

const message = {
  title: "Customer Replied",
  body: "[#12345678] Cannot sign in",
  url: "https://support.example.com/admin/tickets/ticket-1",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("notification webhook protocols", () => {
  it("uses Slack blocks with the incoming-webhook text fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new SlackChannel("https://hooks.slack.example/secret").send(message)
    ).resolves.toEqual({ success: true });
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.redirect).toBe("error");
    const payload = JSON.parse(String(request.body));
    expect(payload.text).toContain("Customer Replied");
    expect(payload.blocks).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "header" })])
    );
  });

  it("uses the Teams Adaptive Card webhook envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new TeamsChannel("https://teams.example/webhook").send(message)
    ).resolves.toEqual({ success: true });
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload).toMatchObject({
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: { type: "AdaptiveCard", version: "1.4" },
        },
      ],
    });
  });

  it("signs Feishu custom-bot cards when a secret is configured", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ code: 0, msg: "success" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new FeishuChannel("https://open.feishu.example/hook", "sign-secret").send(
        message
      )
    ).resolves.toEqual({ success: true });
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload.msg_type).toBe("interactive");
    expect(payload.timestamp).toMatch(/^\d+$/);
    expect(payload.sign).toEqual(expect.any(String));
  });

  it("adds DingTalk timestamp and signature query parameters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ errcode: 0, errmsg: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new DingTalkChannel(
        "https://oapi.dingtalk.example/robot/send?access_token=test",
        "sign-secret"
      ).send(message)
    ).resolves.toEqual({ success: true });
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.searchParams.get("access_token")).toBe("test");
    expect(requestUrl.searchParams.get("timestamp")).toMatch(/^\d+$/);
    expect(requestUrl.searchParams.get("sign")).toBeTruthy();
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload.msgtype).toBe("markdown");
  });

  it("uses the WeCom robot markdown payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ errcode: 0, errmsg: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new WeComChannel("https://qyapi.weixin.example/cgi-bin/webhook/send?key=test").send(
        message
      )
    ).resolves.toEqual({ success: true });
    const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(payload).toMatchObject({
      msgtype: "markdown",
      markdown: { content: expect.stringContaining("Customer Replied") },
    });
  });

  it("returns provider errors instead of reporting successful delivery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("invalid_payload", { status: 400 }))
    );
    await expect(
      new SlackChannel("https://hooks.slack.example/secret").send(message)
    ).resolves.toEqual({ success: false, error: "invalid_payload" });
  });
});
