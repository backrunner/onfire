import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  parseI18nRecord,
  parseSupportedLanguages,
  removeI18nRecordLanguages,
  requestedTocLanguage,
  resolveProductLanguage,
  unsupportedI18nKeys,
} from "./product-language";

describe("requestedTocLanguage", () => {
  const request = (url: string, cookie?: string) =>
    new NextRequest(url, cookie ? { headers: { cookie } } : undefined);

  it("normalizes the lang query parameter to a lowercase base tag", () => {
    expect(requestedTocLanguage(request("https://support.example/?lang=ZH"))).toBe("zh");
    expect(requestedTocLanguage(request("https://support.example/?lang=zh-CN"))).toBe("zh");
    expect(requestedTocLanguage(request("https://support.example/?lang=EN-us"))).toBe("en");
  });

  it("prefers the query parameter over the language cookie", () => {
    expect(
      requestedTocLanguage(
        request("https://support.example/?lang=zh", "onfire-lang=en")
      )
    ).toBe("zh");
  });

  it("falls back to the cookie and returns null when neither is set", () => {
    expect(requestedTocLanguage(request("https://support.example/", "onfire-lang=zh"))).toBe("zh");
    expect(
      requestedTocLanguage(request("https://support.example/", "other=1; onfire-lang=EN"))
    ).toBe("en");
    expect(requestedTocLanguage(request("https://support.example/"))).toBeNull();
  });
});

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

  it("reports keys equal to the default language", () => {
    expect(
      unsupportedI18nKeys([{ en: "x", zh: "y" }], ["en", "zh"], "en")
    ).toEqual(["en"]);
    expect(unsupportedI18nKeys([{ zh: "y" }], ["en", "zh"], "en")).toEqual([]);
  });
});

describe("removeI18nRecordLanguages", () => {
  it("removes only the dropped languages from the stored column", () => {
    expect(
      removeI18nRecordLanguages('{"zh":"姓名","fr":"nom"}', ["zh"])
    ).toBe('{"fr":"nom"}');
    expect(
      removeI18nRecordLanguages('{"zh":"姓名","fr":"nom"}', ["de"])
    ).toBe('{"zh":"姓名","fr":"nom"}');
  });

  it("returns null when nothing remains or the column is unusable", () => {
    expect(removeI18nRecordLanguages('{"zh":"姓名"}', ["zh"])).toBeNull();
    expect(removeI18nRecordLanguages(null, ["zh"])).toBeNull();
    expect(removeI18nRecordLanguages("oops", ["zh"])).toBeNull();
  });
});
