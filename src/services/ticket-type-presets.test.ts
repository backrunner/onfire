import { describe, expect, it } from "vitest";
import { projectPresetTextForProduct } from "./ticket-type-presets";

describe("projectPresetTextForProduct", () => {
  it("rebases an English preset into a Chinese-default product", () => {
    const result = projectPresetTextForProduct(
      "Account",
      '{"zh":"账户"}',
      "zh",
      ["zh", "en"]
    );

    expect(result.base).toBe("账户");
    expect(JSON.parse(result.i18n ?? "{}")).toEqual({ en: "Account" });
  });

  it("keeps English as the base and retains enabled translations", () => {
    const result = projectPresetTextForProduct(
      "Account",
      '{"zh":"账户","fr":"Compte"}',
      "en",
      ["en", "zh"]
    );

    expect(result.base).toBe("Account");
    expect(JSON.parse(result.i18n ?? "{}")).toEqual({ zh: "账户" });
  });

  it("preserves nullable descriptions", () => {
    expect(projectPresetTextForProduct(null, null, "zh", ["zh", "en"])).toEqual({
      base: null,
      i18n: null,
    });
  });
});
