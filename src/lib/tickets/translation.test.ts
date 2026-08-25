import { describe, expect, it } from "vitest";
import type { ReplyRow, TicketRow } from "@/drizzle/schema";
import {
  jsonReplyTranslationMap,
  jsonTranslationMap,
  parseReplyTranslationMap,
  parseTranslationMap,
  translatedReply,
  translatedTicketText,
} from "./translation";

describe("ticket translation storage", () => {
  it("parses only usable translation values and tolerates malformed JSON", () => {
    expect(parseTranslationMap('{"zh":"需要帮助","fr":"","x":1}')).toEqual({
      zh: "需要帮助",
    });
    expect(parseTranslationMap("bad json")).toEqual({});
    expect(
      parseReplyTranslationMap(
        '{"zh":{"content":"您好","contentHtml":"<p>您好</p>"},"fr":{"content":""},"x":"bad"}'
      )
    ).toEqual({
      zh: { content: "您好", contentHtml: "<p>您好</p>" },
    });
  });

  it("projects ticket and reply text into one requested language", () => {
    const ticket = {
      subject: "Need help",
      content: "The service is down",
      subjectTranslations: '{"zh":"需要帮助"}',
      contentTranslations: '{"zh":"服务不可用"}',
    } as TicketRow;
    const reply = {
      content: "We are checking",
      contentHtml: "<p>We are checking</p>",
      translations:
        '{"zh":{"content":"我们正在检查","contentHtml":"<p>我们正在检查</p>"}}',
    } as ReplyRow;

    expect(translatedTicketText(ticket, "zh", "subject")).toBe("需要帮助");
    expect(translatedTicketText(ticket, "fr", "content")).toBe("The service is down");
    expect(translatedReply(reply, "zh")).toEqual({
      content: "我们正在检查",
      contentHtml: "<p>我们正在检查</p>",
    });
    expect(translatedReply(reply, "fr")).toEqual({
      content: "We are checking",
      contentHtml: "<p>We are checking</p>",
    });
  });

  it("serializes empty maps as null", () => {
    expect(jsonTranslationMap({})).toBeNull();
    expect(jsonReplyTranslationMap({})).toBeNull();
    expect(jsonTranslationMap({ zh: "文本" })).toBe('{"zh":"文本"}');
  });
});
