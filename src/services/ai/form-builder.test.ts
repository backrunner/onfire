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
});
