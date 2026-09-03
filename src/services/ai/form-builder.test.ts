import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/db";

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  getAIProvider: vi.fn(),
}));

vi.mock("./config", () => ({ getAIProvider: mocks.getAIProvider }));

import { generateFormSchema } from "./form-builder";

const db = {} as Database;

describe("form builder AI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAIProvider.mockResolvedValue({ complete: mocks.complete });
  });

  it("returns a validated schema draft", async () => {
    mocks.complete.mockResolvedValue({
      content: JSON.stringify({
        response: "Created a bug report form.",
        schema: {
          version: "1.0",
          fields: [
            { id: "steps", key: "steps", label: "Steps", type: "textarea", required: true },
          ],
        },
      }),
    });

    await expect(
      generateFormSchema(db, { tenantId: "tenant-1", productId: "product-1" }, {
        message: "Create a bug report form",
        currentSchema: { version: "1.0", fields: [] },
        defaultLanguage: "en",
        interfaceLanguage: "en",
      })
    ).resolves.toEqual({
      response: "Created a bug report form.",
      schema: {
        version: "1.0",
        fields: [
          { id: "steps", key: "steps", label: "Steps", type: "textarea", required: true },
        ],
      },
    });
  });

  it("rejects a model response with an invalid form", async () => {
    mocks.complete.mockResolvedValue({
      content: JSON.stringify({
        response: "Done",
        schema: {
          version: "1.0",
          fields: [
            { id: "choice", key: "choice", label: "Choice", type: "select", options: [] },
          ],
        },
      }),
    });

    await expect(
      generateFormSchema(db, { tenantId: "tenant-1", productId: "product-1" }, {
        message: "Make a choice form",
        defaultLanguage: "en",
        interfaceLanguage: "en",
      })
    ).rejects.toThrow("schema validation");
  });

  it("returns null when the product has no agent route", async () => {
    mocks.getAIProvider.mockResolvedValue(null);
    await expect(
      generateFormSchema(db, { tenantId: "tenant-1", productId: "product-1" }, {
        message: "Create a form",
        defaultLanguage: "en",
        interfaceLanguage: "en",
      })
    ).resolves.toBeNull();
  });

  it("revises the unapplied pending draft instead of the saved schema", async () => {
    mocks.complete.mockResolvedValue({
      content: JSON.stringify({
        response: "Added a priority field.",
        schema: {
          version: "1.0",
          fields: [
            { id: "steps", key: "steps", label: "Steps", type: "textarea" },
            { id: "priority", key: "priority", label: "Priority", type: "text" },
          ],
        },
      }),
    });

    await generateFormSchema(db, { tenantId: "tenant-1", productId: "product-1" }, {
      message: "Also add a priority field",
      currentSchema: { version: "1.0", fields: [] },
      pendingDraft: {
        version: "1.0",
        fields: [
          { id: "steps", key: "steps", label: "Steps", type: "textarea" },
        ],
      },
      defaultLanguage: "en",
      interfaceLanguage: "en",
    });

    const userMessage = JSON.parse(
      mocks.complete.mock.calls[0][0].messages[1].content
    ) as { currentSchema: { fields: Array<{ id: string }> } };
    expect(userMessage.currentSchema.fields.map((f) => f.id)).toEqual(["steps"]);
  });

  it("falls back to the saved schema when the pending draft is invalid", async () => {
    mocks.complete.mockResolvedValue({
      content: JSON.stringify({
        response: "Done",
        schema: { version: "1.0", fields: [] },
      }),
    });

    await generateFormSchema(db, { tenantId: "tenant-1", productId: "product-1" }, {
      message: "Revise the form",
      currentSchema: {
        version: "1.0",
        fields: [{ id: "saved", key: "saved", label: "Saved", type: "text" }],
      },
      pendingDraft: { version: "1.0", fields: "bad" },
      defaultLanguage: "en",
      interfaceLanguage: "en",
    });

    const userMessage = JSON.parse(
      mocks.complete.mock.calls[0][0].messages[1].content
    ) as { currentSchema: { fields: Array<{ id: string }> } };
    expect(userMessage.currentSchema.fields.map((f) => f.id)).toEqual(["saved"]);
  });

  it("retries once with a higher token budget when the response is truncated", async () => {
    mocks.complete
      .mockResolvedValueOnce({ content: '{"response": "Cut off", "schema": {"ver' })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          response: "Created a bug report form.",
          schema: { version: "1.0", fields: [] },
        }),
      });

    await expect(
      generateFormSchema(db, { tenantId: "tenant-1", productId: "product-1" }, {
        message: "Create a bug report form",
        defaultLanguage: "en",
        interfaceLanguage: "en",
      })
    ).resolves.toEqual({
      response: "Created a bug report form.",
      schema: { version: "1.0", fields: [] },
    });
    expect(mocks.complete).toHaveBeenCalledTimes(2);
    expect(mocks.complete.mock.calls[0][0].maxTokens).toBe(12_000);
    expect(mocks.complete.mock.calls[1][0].maxTokens).toBe(16_000);
  });

  it("propagates the parse failure when the retry is also invalid", async () => {
    mocks.complete.mockResolvedValue({ content: "not json" });
    await expect(
      generateFormSchema(db, { tenantId: "tenant-1", productId: "product-1" }, {
        message: "Create a form",
        defaultLanguage: "en",
        interfaceLanguage: "en",
      })
    ).rejects.toThrow("not valid JSON");
    expect(mocks.complete).toHaveBeenCalledTimes(2);
  });
});
