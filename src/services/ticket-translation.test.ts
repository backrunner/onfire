import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/db";

const mocks = vi.hoisted(() => ({
  translateTicketContent: vi.fn(),
  translateTicketFields: vi.fn(),
}));

vi.mock("@/services/ai/translation", () => mocks);

import {
  effectiveProductLanguages,
  prepareReplyTranslation,
  prepareTicketTranslation,
} from "./ticket-translation";

const db = {} as Database;
type Product = Parameters<typeof prepareTicketTranslation>[1];

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1",
    tenantId: "tenant-1",
    name: "Product",
    homepageUrl: null,
    portalReturnUrl: null,
    slaHighAccept: null,
    slaHighReply: null,
    slaMediumAccept: null,
    slaMediumReply: null,
    slaLowAccept: null,
    slaLowReply: null,
    autoCloseMinutes: null,
    defaultLanguage: "en",
    supportedLanguages: '["en","zh"]',
    ...overrides,
  };
}

describe("ticket translation orchestration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips AI for a single-language product", async () => {
    const single = product({ defaultLanguage: "zh", supportedLanguages: null });

    expect(effectiveProductLanguages(single)).toEqual(["zh"]);
    await expect(
      prepareTicketTranslation(db, single, {
        subject: "主题",
        content: "内容",
        sourceLanguage: "en",
      })
    ).resolves.toEqual({
      customerLanguage: "zh",
      subjectTranslations: null,
      contentTranslations: null,
    });
    expect(mocks.translateTicketFields).not.toHaveBeenCalled();
  });

  it("translates a known customer language into every other product language", async () => {
    mocks.translateTicketFields.mockResolvedValue({
      detectedLanguage: "zh",
      subject: { en: "Help" },
      content: { en: "Details" },
    });

    const result = await prepareTicketTranslation(db, product(), {
      subject: "帮助",
      content: "详情",
      sourceLanguage: "zh",
    });

    expect(mocks.translateTicketFields).toHaveBeenCalledWith(
      db,
      { tenantId: "tenant-1", productId: "product-1" },
      expect.objectContaining({ sourceLang: "zh", targetLangs: ["en"] })
    );
    expect(result).toEqual({
      customerLanguage: "zh",
      subjectTranslations: '{"en":"Help"}',
      contentTranslations: '{"en":"Details"}',
    });
  });

  it("detects unknown email intake language while translating to the default", async () => {
    mocks.translateTicketFields.mockResolvedValue({
      detectedLanguage: "zh",
      subject: { en: "Help" },
      content: { en: "Details" },
    });

    const result = await prepareTicketTranslation(db, product(), {
      subject: "帮助",
      content: "详情",
    });

    expect(mocks.translateTicketFields).toHaveBeenCalledWith(
      db,
      expect.anything(),
      expect.objectContaining({ sourceLang: null, targetLangs: ["en"] })
    );
    expect(result.customerLanguage).toBe("zh");
  });

  it("stores exactly the reader-language projection for a translated reply", async () => {
    mocks.translateTicketContent.mockResolvedValue({
      detectedLanguage: "en",
      content: "您好",
      contentHtml: "<p>您好</p>",
    });

    await expect(
      prepareReplyTranslation(db, product(), {
        content: "Hello",
        contentHtml: "<p>Hello</p>",
        targetLanguage: "zh",
      })
    ).resolves.toEqual({
      detectedLanguage: "en",
      translations:
        '{"zh":{"content":"您好","contentHtml":"<p>您好</p>"}}',
    });
  });

  it("skips reply translation when the known source already matches the target", async () => {
    await expect(
      prepareReplyTranslation(db, product(), {
        content: "您好",
        sourceLanguage: "zh",
        targetLanguage: "zh",
      })
    ).resolves.toEqual({ detectedLanguage: "zh", translations: null });
    expect(mocks.translateTicketContent).not.toHaveBeenCalled();
  });
});
