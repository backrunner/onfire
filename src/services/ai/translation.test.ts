import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/db";

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  getAIProvider: vi.fn(),
}));

vi.mock("./config", () => ({
  getAIProvider: mocks.getAIProvider,
}));

import {
  translateTexts,
  translateTicketContent,
  translateTicketFields,
} from "./translation";

const db = {} as Database;

describe("AI translation response validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAIProvider.mockResolvedValue({ complete: mocks.complete });
  });

  it("returns only requested ids and languages when the response is complete", async () => {
    mocks.complete.mockResolvedValue({
      content: JSON.stringify({
        translations: {
          name: { zh: "名称", fr: "Nom" },
          description: { zh: "说明" },
          injected: { zh: "ignored" },
        },
      }),
    });

    await expect(
      translateTexts(db, {}, {
        sourceLang: "en",
        targetLangs: ["zh"],
        texts: [
          { id: "name", text: "Name" },
          { id: "description", text: "Description" },
        ],
      })
    ).resolves.toEqual({
      name: { zh: "名称" },
      description: { zh: "说明" },
    });
  });

  it("rejects an incomplete batch translation", async () => {
    mocks.complete.mockResolvedValue({
      content: JSON.stringify({ translations: { name: { zh: "名称" } } }),
    });

    await expect(
      translateTexts(db, {}, {
        sourceLang: "en",
        targetLangs: ["zh"],
        texts: [
          { id: "name", text: "Name" },
          { id: "description", text: "Description" },
        ],
      })
    ).rejects.toThrow("description:zh");
  });

  it("rejects ticket fields when either field misses a target language", async () => {
    mocks.complete.mockResolvedValue({
      content: JSON.stringify({
        detectedLanguage: "en",
        translations: {
          subject: { zh: "主题" },
          content: {},
        },
      }),
    });

    await expect(
      translateTicketFields(db, {}, {
        subject: "Subject",
        content: "Content",
        sourceLang: "en",
        targetLangs: ["zh"],
      })
    ).rejects.toThrow("incomplete for zh");
  });

  it("normalizes detected language tags and sanitizes translated HTML", async () => {
    mocks.complete.mockResolvedValue({
      content: JSON.stringify({
        detectedLanguage: "zh-CN",
        content: "Hello",
        contentHtml: '<p>Hello</p><script>alert("x")</script>',
      }),
    });

    const result = await translateTicketContent(db, {}, {
      text: "你好",
      html: "<p>你好</p>",
      targetLang: "en",
    });

    expect(result.detectedLanguage).toBe("zh");
    expect(result.contentHtml).toContain("<p>Hello</p>");
    expect(result.contentHtml).not.toContain("script");
  });

  it("does not call a provider when source and target languages match", async () => {
    await expect(
      translateTicketContent(db, {}, {
        text: "Already translated",
        html: "<p>Already translated</p>",
        sourceLang: "en",
        targetLang: "en",
      })
    ).resolves.toEqual({
      detectedLanguage: "en",
      content: "Already translated",
      contentHtml: "<p>Already translated</p>",
    });
    expect(mocks.getAIProvider).not.toHaveBeenCalled();
  });

  it("translates a 50k ticket body in ordered chunks and detects only once", async () => {
    const body = "Paragraph content.\n".repeat(2_700);
    mocks.complete.mockImplementation(async (request) => {
      const payload = JSON.parse(request.messages[1].content) as {
        subject: string;
        content: string;
      };
      return {
        content: JSON.stringify({
          detectedLanguage: "en-US",
          translations: {
            subject: payload.subject
              ? { zh: "主题", fr: "Sujet" }
              : {},
            content: { zh: payload.content, fr: payload.content },
          },
        }),
      };
    });

    await expect(
      translateTicketFields(db, {}, {
        subject: "Subject",
        content: body,
        targetLangs: ["zh", "fr"],
      })
    ).resolves.toEqual({
      detectedLanguage: "en",
      subject: { zh: "主题", fr: "Sujet" },
      content: { zh: body, fr: body },
    });

    expect(body.length).toBeGreaterThan(50_000);
    expect(mocks.complete.mock.calls.length).toBeGreaterThan(10);
    expect(mocks.complete.mock.calls[0][0].messages[0].content).toContain(
      "Detect the source language"
    );
    for (const [request] of mocks.complete.mock.calls.slice(1)) {
      expect(request.messages[0].content).toContain("source language is en");
    }
  });

  it("fails the whole long translation when any chunk fails", async () => {
    mocks.complete
      .mockResolvedValueOnce({
        content: JSON.stringify({
          detectedLanguage: "en",
          translations: {
            subject: { zh: "主题" },
            content: { zh: "first" },
          },
        }),
      })
      .mockRejectedValueOnce(new Error("provider unavailable"));

    await expect(
      translateTicketFields(db, {}, {
        subject: "Subject",
        content: "Long sentence. ".repeat(700),
        targetLangs: ["zh"],
      })
    ).rejects.toThrow("provider unavailable");
  });

  it("chunks long rich text while preserving sanitized tags and attributes", async () => {
    const plain = "Hello world. ".repeat(700);
    const html = `<p>${"Hello world. ".repeat(700)}<a href="https://example.com/help">Open</a><img src="/api/attachments/abc123" alt="shot"></p><script>bad()</script>`;
    mocks.complete.mockImplementation(async (request) => {
      const user = request.messages[1].content as string;
      if (user.startsWith("Text:\n")) {
        return {
          content: JSON.stringify({
            detectedLanguage: "en",
            content: user.slice("Text:\n".length),
            contentHtml: null,
          }),
        };
      }
      const items = JSON.parse(user) as Array<{ id: string; text: string }>;
      return {
        content: JSON.stringify({
          translations: Object.fromEntries(
            items.map((item) => [item.id, { zh: `译${item.text}` }])
          ),
        }),
      };
    });

    const result = await translateTicketContent(db, {}, {
      text: plain,
      html,
      targetLang: "zh",
    });

    expect(result.content).toBe(plain);
    expect(result.contentHtml).toContain("译Hello world");
    expect(result.contentHtml).toContain(
      '<a href="https://example.com/help" target="_blank" rel="noopener noreferrer nofollow">'
    );
    expect(result.contentHtml).toContain(
      '<img src="/api/attachments/abc123" alt="shot" loading="lazy">'
    );
    expect(result.contentHtml).not.toContain("script");
    for (const [request] of mocks.complete.mock.calls) {
      expect(request.messages[1].content).not.toContain("HTML:\n");
    }
  });
});
