import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import {
  localizeApiErrorMessage,
  requestLanguage,
} from "./error-messages";
import { zhErrorMessages } from "./error-messages.zh";

function fakeReq(headers: Record<string, string>): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

describe("localizeApiErrorMessage", () => {
  it("passes messages through for English", () => {
    expect(localizeApiErrorMessage("Agent not found", "en")).toBe(
      "Agent not found"
    );
  });

  it("translates exact matches for zh", () => {
    expect(localizeApiErrorMessage("Agent not found", "zh")).toBe("坐席不存在");
    expect(localizeApiErrorMessage("Unauthorized", "zh")).toBe(
      "未授权，请先登录"
    );
  });

  it("falls back to the source message when unmapped", () => {
    expect(localizeApiErrorMessage("Something unmapped", "zh")).toBe(
      "Something unmapped"
    );
  });

  it("translates parameterized lifecycle messages", () => {
    expect(
      localizeApiErrorMessage('Ticket is already in status "closed"', "zh")
    ).toBe("工单已处于「已关闭」状态");
    expect(
      localizeApiErrorMessage(
        "Invalid status transition: processing → replied",
        "zh"
      )
    ).toBe("非法的状态流转：处理中 → 已回复");
  });
});

describe("requestLanguage", () => {
  it("reads the onfire-lang cookie", () => {
    expect(requestLanguage(fakeReq({ cookie: "onfire-lang=zh" }))).toBe("zh");
    expect(
      requestLanguage(fakeReq({ cookie: "theme=dark; onfire-lang=en" }))
    ).toBe("en");
  });

  it("falls back to Accept-Language", () => {
    expect(
      requestLanguage(fakeReq({ "accept-language": "zh-CN,zh;q=0.9" }))
    ).toBe("zh");
    expect(requestLanguage(fakeReq({}))).toBe("en");
    expect(
      requestLanguage(fakeReq({ "accept-language": "en-US,en;q=0.9" }))
    ).toBe("en");
  });
});

describe("zhErrorMessages map", () => {
  it("has a non-empty translation for every key", () => {
    for (const [key, value] of Object.entries(zhErrorMessages)) {
      expect(value.length, `empty translation for "${key}"`).toBeGreaterThan(0);
    }
  });
});
