import { describe, expect, it } from "vitest";
import { i18nRecordSchema, nullableI18nField } from "./i18n-schema";

describe("i18nRecordSchema", () => {
  it("bounds language keys and translated values", () => {
    const schema = i18nRecordSchema(5);
    expect(schema.safeParse({ zh: "12345" }).success).toBe(true);
    expect(schema.safeParse({ zh: "123456" }).success).toBe(false);
    expect(schema.safeParse({ x: "ok" }).success).toBe(false);
    expect(schema.safeParse({ "language-code-that-is-too-long": "ok" }).success).toBe(false);
  });

  it("preserves nullable and optional route semantics", () => {
    const schema = nullableI18nField(10);
    expect(schema.safeParse(undefined).success).toBe(true);
    expect(schema.safeParse(null).success).toBe(true);
  });
});
