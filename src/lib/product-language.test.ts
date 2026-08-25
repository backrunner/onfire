import { describe, expect, it } from "vitest";
import {
  parseI18nRecord,
  parseSupportedLanguages,
  resolveProductLanguage,
  unsupportedI18nKeys,
} from "./product-language";

describe("parseSupportedLanguages", () => {
  it("parses the JSON array column and tolerates malformed values", () => {
    expect(parseSupportedLanguages('["en","zh"]')).toEqual(["en", "zh"]);
    expect(parseSupportedLanguages('["en","en"]')).toEqual(["en"]);
    expect(parseSupportedLanguages(null)).toEqual([]);
    expect(parseSupportedLanguages(undefined)).toEqual([]);
    expect(parseSupportedLanguages("not json")).toEqual([]);
    expect(parseSupportedLanguages('{"en":true}')).toEqual([]);
    expect(parseSupportedLanguages('["en",1]')).toEqual(["en"]);
  });
});

describe("parseI18nRecord", () => {
  it("parses a string map and drops non-string values", () => {
    expect(parseI18nRecord('{"zh":"姓名"}')).toEqual({ zh: "姓名" });
    expect(parseI18nRecord('{"zh":"姓名","x":1}')).toEqual({ zh: "姓名" });
    expect(parseI18nRecord(null)).toBeNull();
    expect(parseI18nRecord("[]")).toBeNull();
    expect(parseI18nRecord("oops")).toBeNull();
  });
});

describe("resolveProductLanguage", () => {
  const product = { defaultLanguage: "en", supportedLanguages: '["en","zh"]' };

  it("uses the requested language when the product supports it", () => {
    expect(resolveProductLanguage(product, "zh", "en")).toBe("zh");
    expect(resolveProductLanguage(product, "en")).toBe("en");
  });

  it("ignores an unsupported request and intersects Accept-Language instead", () => {
    expect(resolveProductLanguage(product, "fr", "zh-CN,zh;q=0.9")).toBe("zh");
  });

  it("honours Accept-Language quality ordering and base tags", () => {
    expect(resolveProductLanguage(product, null, "en;q=0.5,zh;q=0.9")).toBe("zh");
    expect(resolveProductLanguage(product, null, "fr, en;q=0.8")).toBe("en");
  });

  it("falls back to the product default language", () => {
    expect(resolveProductLanguage(product, "fr", "fr")).toBe("en");
    expect(resolveProductLanguage(product, null, null)).toBe("en");
    expect(resolveProductLanguage(product)).toBe("en");
  });

  it("always serves the default when no supported set is configured", () => {
    const single = { defaultLanguage: "zh", supportedLanguages: null };
    expect(resolveProductLanguage(single, "en", "en")).toBe("zh");
  });
});

describe("unsupportedI18nKeys", () => {
  it("returns sorted keys outside the supported set", () => {
    expect(
      unsupportedI18nKeys(
        [{ zh: "x" }, { fr: "y", de: "z" }, null, undefined],
        ["en", "zh"]
      )
    ).toEqual(["de", "fr"]);
  });

  it("forbids every key when the supported set is empty", () => {
    expect(unsupportedI18nKeys([{ en: "x" }], [])).toEqual(["en"]);
  });

  it("returns empty when nothing is outside the set", () => {
    expect(unsupportedI18nKeys([{ zh: "x" }], ["en", "zh"])).toEqual([]);
  });
});
