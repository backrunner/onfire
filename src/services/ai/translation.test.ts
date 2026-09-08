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

  it("preserves short reply links and images while escaping translated text nodes", async () => {
    mocks.complete.mockResolvedValueOnce({
      content: JSON.stringify({ detectedLanguage: "zh-CN", content: "Hello" }),
    }).mockResolvedValueOnce({
      content: JSON.stringify({ translations: { "html-0": { en: "Hello<script>bad()</script>" } } }),
    });
    const result = await translateTicketContent(db, {}, {
      text: "你好",
      html: '<p><a href="https://example.com/help">你好</a><img src="/api/attachments/abc123"></p>',
      targetLang: "en",
    });
    expect(result.detectedLanguage).toBe("zh");
    expect(result.contentHtml).toContain('href="https://example.com/help"');
    expect(result.contentHtml).toContain('/api/attachments/abc123');
    expect(result.contentHtml).toContain('Hello&lt;script&gt;');
    expect(result.contentHtml).not.toContain('<script>');
    for (const [request] of mocks.complete.mock.calls) {
      expect(request.messages[1].content).not.toContain('href=');
    }
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

  it("preserves image-only replies without requiring a language model", async () => {
    mocks.getAIProvider.mockResolvedValue(null);
    const result = await translateTicketContent(db, {}, {
      text: "", html: '<p><img src="/api/attachments/abc123"></p>', targetLang: "zh",
    });
    expect(result.content).toBe("");
    expect(result.contentHtml).toContain('/api/attachments/abc123');
    expect(mocks.getAIProvider).not.toHaveBeenCalled();
  });

  it("sanitizes HTML even when the source language already matches", async () => {
    const result = await translateTicketContent(db, {}, {
      text: "Hello", html: '<p>Hello</p><script>alert(1)</script>',
      sourceLang: "en", targetLang: "en",
    });
    expect(result.contentHtml).toBe("<p>Hello</p>");
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

  it("splits translateTexts into batches by item count and merges them", async () => {
    const texts = Array.from({ length: 45 }, (_, index) => ({
      id: `t-${index}`,
      text: `Text ${index}`,
    }));
    mocks.complete.mockImplementation(async (request) => {
      const items = JSON.parse(request.messages[1].content) as typeof texts;
      return {
        content: JSON.stringify({
          translations: Object.fromEntries(
            items.map((item) => [item.id, { zh: `译${item.text}` }])
          ),
        }),
      };
    });

    const result = await translateTexts(db, {}, {
      sourceLang: "en",
      targetLangs: ["zh"],
      texts,
    });

    expect(mocks.complete.mock.calls.length).toBe(3);
    expect(Object.keys(result).length).toBe(45);
    expect(result["t-0"]).toEqual({ zh: "译Text 0" });
    expect(result["t-44"]).toEqual({ zh: "译Text 44" });
    for (const [request] of mocks.complete.mock.calls) {
      const items = JSON.parse(request.messages[1].content) as typeof texts;
      expect(items.length).toBeLessThanOrEqual(20);
    }
  });

  it("splits translateTexts batches by total input size", async () => {
    const texts = Array.from({ length: 5 }, (_, index) => ({
      id: `big-${index}`,
      text: "x".repeat(2_000),
    }));
    mocks.complete.mockImplementation(async (request) => {
      const items = JSON.parse(request.messages[1].content) as typeof texts;
      return {
        content: JSON.stringify({
          translations: Object.fromEntries(
            items.map((item) => [item.id, { zh: item.id }])
          ),
        }),
      };
    });

    const result = await translateTexts(db, {}, {
      sourceLang: "en",
      targetLangs: ["zh"],
      texts,
    });

    expect(mocks.complete.mock.calls.length).toBe(2);
    expect(Object.keys(result).length).toBe(5);
    for (const [request] of mocks.complete.mock.calls) {
      const items = JSON.parse(request.messages[1].content) as typeof texts;
      const chars = items.reduce((total, item) => total + item.text.length, 0);
      expect(chars).toBeLessThanOrEqual(8_000);
    }
  });

  it("asks the batch translator to preserve placeholders and fails when any batch fails", async () => {
    const texts = Array.from({ length: 25 }, (_, index) => ({
      id: `t-${index}`,
      text: `Text ${index}`,
    }));
    mocks.complete.mockImplementation(async (request) => {
      expect(request.messages[0].content).toContain("{{...}}");
      const items = JSON.parse(request.messages[1].content) as typeof texts;
      if (items.some((item) => item.id === "t-21")) {
        throw new Error("provider unavailable");
      }
      return {
        content: JSON.stringify({
          translations: Object.fromEntries(
            items.map((item) => [item.id, { zh: item.text }])
          ),
        }),
      };
    });

    await expect(
      translateTexts(db, {}, {
        sourceLang: "en",
        targetLangs: ["zh"],
        texts,
      })
    ).rejects.toThrow("provider unavailable");
    expect(mocks.complete.mock.calls.length).toBe(2);
  });

  it("omits the source-language hint when detection reported unknown", async () => {
    const plain = "Hello world. ".repeat(700);
    const html = `<p>${"Hello world. ".repeat(400)}</p>`;
    mocks.complete.mockImplementation(async (request) => {
      const user = request.messages[1].content as string;
      if (user.startsWith("Text:\n")) {
        return {
          content: JSON.stringify({ content: user.slice("Text:\n".length) }),
        };
      }
      const items = JSON.parse(user) as Array<{ id: string; text: string }>;
      return {
        content: JSON.stringify({
          translations: Object.fromEntries(
            items.map((item) => [item.id, { zh: item.text }])
          ),
        }),
      };
    });

    await translateTicketContent(db, {}, {
      text: plain,
      html,
      targetLang: "zh",
    });

    const htmlBatchCalls = mocks.complete.mock.calls.filter(
      ([request]) => !(request.messages[1].content as string).startsWith("Text:\n")
    );
    expect(htmlBatchCalls.length).toBeGreaterThan(0);
    for (const [request] of htmlBatchCalls) {
      expect(request.messages[0].content).toContain("from its original language");
      expect(request.messages[0].content).not.toContain("unknown");
    }
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
