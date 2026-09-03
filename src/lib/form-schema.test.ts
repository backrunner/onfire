import { describe, expect, it } from "vitest";
import {
  createEmptyFormSchema,
  isEmptyFieldValue,
  isFieldVisible,
  localizeFormSchema,
  mergeFormSchemaI18n,
  parseFormSchemaValue,
  removeFormSchemaLanguages,
  stripFormSchemaI18n,
  validateFormSchemaLanguages,
  validateFormSubmission,
  validateFormSchema,
  type FormFieldSchema,
  type FormSchema,
} from "./form-schema";

const field = (overrides: Partial<FormFieldSchema>): FormFieldSchema => ({
  id: "f1",
  key: "k1",
  label: "Field",
  type: "text",
  ...overrides,
});

describe("isEmptyFieldValue", () => {
  it("treats undefined/null/blank/empty array/false as empty", () => {
    expect(isEmptyFieldValue(undefined)).toBe(true);
    expect(isEmptyFieldValue(null)).toBe(true);
    expect(isEmptyFieldValue("")).toBe(true);
    expect(isEmptyFieldValue("  ")).toBe(true);
    expect(isEmptyFieldValue([])).toBe(true);
    expect(isEmptyFieldValue(false)).toBe(true);
  });

  it("treats content, selections and true as filled", () => {
    expect(isEmptyFieldValue("x")).toBe(false);
    expect(isEmptyFieldValue(["a"])).toBe(false);
    expect(isEmptyFieldValue(true)).toBe(false);
    expect(isEmptyFieldValue(0)).toBe(false);
  });
});

describe("isFieldVisible", () => {
  const conditional = (
    operator: "equals" | "notEquals" | "contains" | "isEmpty" | "isNotEmpty",
    value?: unknown
  ) =>
    field({
      id: "f2",
      key: "k2",
      condition: { fieldId: "f1", operator, value },
    });

  it("shows unconditioned fields", () => {
    expect(isFieldVisible(field({}), {})).toBe(true);
  });

  it("string-coerces equals so number inputs match string condition values", () => {
    expect(isFieldVisible(conditional("equals", "5"), { f1: 5 })).toBe(true);
    expect(isFieldVisible(conditional("equals", "5"), { f1: "5" })).toBe(true);
    expect(isFieldVisible(conditional("equals", "5"), { f1: "6" })).toBe(false);
    expect(isFieldVisible(conditional("equals", "true"), { f1: true })).toBe(true);
  });

  it("matches array values (multi-checkbox) for equals/contains", () => {
    expect(isFieldVisible(conditional("equals", "a"), { f1: ["a", "b"] })).toBe(true);
    expect(isFieldVisible(conditional("contains", "b"), { f1: ["a", "b"] })).toBe(true);
    expect(isFieldVisible(conditional("notEquals", "a"), { f1: ["a"] })).toBe(false);
    expect(isFieldVisible(conditional("contains", "c"), { f1: ["a", "b"] })).toBe(false);
  });

  it("handles isEmpty/isNotEmpty incl. arrays and unchecked booleans", () => {
    expect(isFieldVisible(conditional("isEmpty"), {})).toBe(true);
    expect(isFieldVisible(conditional("isEmpty"), { f1: [] })).toBe(true);
    expect(isFieldVisible(conditional("isEmpty"), { f1: false })).toBe(true);
    expect(isFieldVisible(conditional("isNotEmpty"), { f1: "x" })).toBe(true);
    expect(isFieldVisible(conditional("isNotEmpty"), { f1: [] })).toBe(false);
  });
});

describe("validateFormSchema", () => {
  const schemaWith = (...fields: FormFieldSchema[]): FormSchema => ({
    ...createEmptyFormSchema(),
    fields,
  });

  it("accepts a valid schema", () => {
    const schema = schemaWith(
      field({ id: "a", key: "ka" }),
      field({
        id: "b",
        key: "kb",
        type: "select",
        options: [
          { label: "One", value: "one" },
          { label: "Two", value: "two" },
        ],
        condition: { fieldId: "a", operator: "isNotEmpty" },
      })
    );
    expect(validateFormSchema(schema)).toEqual([]);
  });

  it("rejects duplicate keys and ids", () => {
    const schema = schemaWith(
      field({ id: "a", key: "same" }),
      field({ id: "a", key: "same" })
    );
    const codes = validateFormSchema(schema).map((e) => e.code);
    expect(codes).toContain("duplicateId");
    expect(codes).toContain("duplicateKey");
  });

  it("rejects choice fields with missing/empty/duplicate option values", () => {
    const noOptions = schemaWith(field({ type: "radio" }));
    expect(validateFormSchema(noOptions).map((e) => e.code)).toContain(
      "needsOptions"
    );

    const emptyValue = schemaWith(
      field({ type: "select", options: [{ label: "One", value: "" }] })
    );
    expect(validateFormSchema(emptyValue).map((e) => e.code)).toContain(
      "emptyOptionValue"
    );

    const duplicateValue = schemaWith(
      field({
        type: "checkbox",
        options: [
          { label: "One", value: "x" },
          { label: "Two", value: "x" },
        ],
      })
    );
    expect(validateFormSchema(duplicateValue).map((e) => e.code)).toContain(
      "duplicateOptionValue"
    );
  });

  it("rejects conditions referencing a missing field", () => {
    const schema = schemaWith(
      field({ condition: { fieldId: "ghost", operator: "equals", value: "1" } })
    );
    expect(validateFormSchema(schema).map((e) => e.code)).toContain(
      "badCondition"
    );
  });
});

describe("stored form submissions", () => {
  const schema: FormSchema = {
    version: "1.0",
    fields: [
      field({ id: "email", key: "email", type: "email", required: true }),
      field({
        id: "plan",
        key: "plan",
        type: "select",
        options: [
          { label: "Free", value: "free" },
          { label: "Pro", value: "pro" },
        ],
      }),
      field({
        id: "seats",
        key: "seats",
        type: "number",
        validation: { min: 1, max: 10 },
      }),
    ],
  };

  it("parses a bounded current schema and normalizes an empty schema", () => {
    expect(parseFormSchemaValue(schema)).toEqual(schema);
    expect(parseFormSchemaValue({})).toEqual({ version: "1.0", fields: [] });
    expect(parseFormSchemaValue({ version: "1.0", fields: "bad" })).toBeNull();
  });

  it("rejects translated form text beyond each base field limit", () => {
    const tooLongLabel = {
      ...schema,
      fields: [field({ labelI18n: { zh: "x".repeat(201) } })],
    };
    const tooLongPlaceholder = {
      ...schema,
      fields: [field({ placeholderI18n: { zh: "x".repeat(501) } })],
    };
    const tooLongHelp = {
      ...schema,
      fields: [field({ helpTextI18n: { zh: "x".repeat(1001) } })],
    };
    expect(parseFormSchemaValue(tooLongLabel)).toBeNull();
    expect(parseFormSchemaValue(tooLongPlaceholder)).toBeNull();
    expect(parseFormSchemaValue(tooLongHelp)).toBeNull();
  });

  it("enforces required, type, range, and option constraints server-side", () => {
    expect(
      validateFormSubmission(schema, {
        email: "user@example.com",
        plan: "pro",
        seats: 5,
      })
    ).toEqual([]);

    const errors = validateFormSubmission(schema, {
      plan: "enterprise",
      seats: 50,
    });
    expect(errors.map((error) => error.field)).toEqual(
      expect.arrayContaining(["email", "plan", "seats"])
    );
  });
});

describe("localizeFormSchema", () => {
  const schema: FormSchema = {
    version: "1.0",
    fields: [
      field({
        id: "a",
        key: "ka",
        label: "Name",
        labelI18n: { zh: "姓名" },
        placeholder: "Your name",
        placeholderI18n: { zh: "您的姓名" },
        description: "Shown under the label",
        descriptionI18n: { fr: "fr only" },
        helpText: "We never share it",
        validation: {
          pattern: "^\\w+$",
          patternMessage: "Letters only",
          patternMessageI18n: { zh: "仅限字母" },
        },
      }),
      field({
        id: "b",
        key: "kb",
        type: "select",
        options: [
          { label: "Free", value: "free", labelI18n: { zh: "免费" } },
          { label: "Pro", value: "pro" },
        ],
      }),
    ],
    layout: {
      columns: 1,
      sections: [
        {
          title: "Basics",
          titleI18n: { zh: "基本信息" },
          description: "Start here",
          fields: ["a", "b"],
        },
      ],
    },
  };

  it("overrides base text when the language has a translation", () => {
    const localized = localizeFormSchema(schema, "zh");
    expect(localized.fields[0].label).toBe("姓名");
    expect(localized.fields[0].placeholder).toBe("您的姓名");
    expect(localized.fields[0].validation?.patternMessage).toBe("仅限字母");
    expect(localized.fields[1].options?.[0].label).toBe("免费");
    expect(localized.layout?.sections?.[0].title).toBe("基本信息");
  });

  it("falls back to the base field when the language key is missing", () => {
    const localized = localizeFormSchema(schema, "zh");
    expect(localized.fields[0].description).toBe("Shown under the label");
    expect(localized.fields[0].helpText).toBe("We never share it");
    expect(localized.fields[1].options?.[1].label).toBe("Pro");
    expect(localized.layout?.sections?.[0].description).toBe("Start here");
  });

  it("strips i18n companions and never translates keys or option values", () => {
    const localized = localizeFormSchema(schema, "zh");
    expect(JSON.stringify(localized)).not.toContain("I18n");
    expect(localized.fields[0].key).toBe("ka");
    expect(localized.fields[1].options?.[0].value).toBe("free");
  });

  it("does not mutate the source schema", () => {
    localizeFormSchema(schema, "zh");
    expect(schema.fields[0].label).toBe("Name");
    expect(schema.fields[0].labelI18n).toEqual({ zh: "姓名" });
    expect(schema.layout?.sections?.[0].titleI18n).toEqual({ zh: "基本信息" });
  });

  it("round-trips through the stored zod schema with i18n companions", () => {
    expect(parseFormSchemaValue(schema)).toEqual(schema);
  });
});

describe("mergeFormSchemaI18n", () => {
  const previous: FormSchema = {
    version: "1.0",
    fields: [
      field({
        id: "a",
        key: "ka",
        label: "Name",
        labelI18n: { zh: "姓名" },
        description: "Shown under the label",
        descriptionI18n: { zh: "显示在标签下方" },
        placeholder: "Your name",
        placeholderI18n: { zh: "您的姓名" },
        validation: {
          patternMessage: "Letters only",
          patternMessageI18n: { zh: "仅限字母" },
        },
      }),
      field({
        id: "b",
        key: "kb",
        type: "select",
        options: [
          { label: "Free", value: "free", labelI18n: { zh: "免费" } },
          { label: "Pro", value: "pro", labelI18n: { zh: "专业" } },
        ],
      }),
    ],
    layout: {
      sections: [
        {
          title: "Basics",
          titleI18n: { zh: "基本信息" },
          description: "Start here",
          descriptionI18n: { zh: "从这里开始" },
          fields: ["a", "b"],
        },
      ],
    },
  };

  it("copies companions for fields whose base text is unchanged", () => {
    const next: FormSchema = {
      version: "1.0",
      fields: [
        field({
          id: "a",
          key: "ka",
          label: "Name",
          description: "Shown under the label",
          required: true,
        }),
        field({
          id: "b",
          key: "kb",
          type: "select",
          options: [
            { label: "Free", value: "free" },
            { label: "Enterprise", value: "pro" },
          ],
        }),
        field({ id: "c", key: "kc", label: "New" }),
      ],
      layout: {
        sections: [{ title: "Basics", description: "Start here", fields: ["a"] }],
      },
    };
    const merged = mergeFormSchemaI18n(previous, next);
    expect(merged.fields[0].labelI18n).toEqual({ zh: "姓名" });
    expect(merged.fields[0].descriptionI18n).toEqual({ zh: "显示在标签下方" });
    // Base placeholder absent in next (was set in previous): treat as changed.
    expect(merged.fields[0].placeholderI18n).toBeUndefined();
    expect(merged.fields[0].validation?.patternMessageI18n).toBeUndefined();
    // Options match by value; only the unchanged label keeps its translation.
    expect(merged.fields[1].options?.[0].labelI18n).toEqual({ zh: "免费" });
    expect(merged.fields[1].options?.[1].labelI18n).toBeUndefined();
    // Unknown fields and untranslated sections pass through untouched.
    expect(merged.fields[2]).toEqual(next.fields[2]);
    expect(merged.layout?.sections?.[0].titleI18n).toEqual({ zh: "基本信息" });
    expect(merged.layout?.sections?.[0].descriptionI18n).toEqual({
      zh: "从这里开始",
    });
  });

  it("drops companions when the base text changed", () => {
    const next: FormSchema = {
      version: "1.0",
      fields: [
        field({
          id: "a",
          key: "ka",
          label: "Full name",
          description: "Shown under the label",
          placeholder: "Your name",
          validation: { patternMessage: "Letters only" },
        }),
      ],
    };
    const merged = mergeFormSchemaI18n(previous, next);
    expect(merged.fields[0].labelI18n).toBeUndefined();
    // Unchanged companions survive even when a sibling text changed.
    expect(merged.fields[0].descriptionI18n).toEqual({ zh: "显示在标签下方" });
    expect(merged.fields[0].placeholderI18n).toEqual({ zh: "您的姓名" });
    expect(merged.fields[0].validation?.patternMessageI18n).toEqual({
      zh: "仅限字母",
    });
  });

  it("does not mutate the inputs", () => {
    const next: FormSchema = {
      version: "1.0",
      fields: [field({ id: "a", key: "ka", label: "Name" })],
    };
    mergeFormSchemaI18n(previous, next);
    expect(previous.fields[0].labelI18n).toEqual({ zh: "姓名" });
    expect(next.fields[0].labelI18n).toBeUndefined();
  });
});

describe("validateFormSchemaLanguages", () => {
  it("accepts i18n keys inside the supported set", () => {
    const schema: FormSchema = {
      ...createEmptyFormSchema(),
      fields: [field({ labelI18n: { zh: "姓名", en: "Name" } })],
    };
    expect(validateFormSchemaLanguages(schema, ["en", "zh"])).toEqual([]);
  });

  it("collects unsupported keys across fields, options, validation and sections", () => {
    const schema: FormSchema = {
      version: "1.0",
      fields: [
        field({
          placeholderI18n: { fr: "x" },
          validation: { patternMessageI18n: { de: "x" } },
          options: [{ label: "A", value: "a", labelI18n: { fr: "x" } }],
        }),
      ],
      layout: { sections: [{ titleI18n: { ja: "x" }, fields: ["f1"] }] },
    };
    expect(validateFormSchemaLanguages(schema, ["en", "zh"])).toEqual([
      "de",
      "fr",
      "ja",
    ]);
  });

  it("forbids all i18n keys when the product has no supported set", () => {
    const schema: FormSchema = {
      ...createEmptyFormSchema(),
      fields: [field({ helpTextI18n: { zh: "x" } })],
    };
    expect(validateFormSchemaLanguages(schema, [])).toEqual(["zh"]);
  });

  it("rejects companion keys equal to the default language", () => {
    const schema: FormSchema = {
      ...createEmptyFormSchema(),
      fields: [field({ labelI18n: { zh: "姓名", en: "Name" } })],
    };
    expect(validateFormSchemaLanguages(schema, ["en", "zh"], "en")).toEqual([
      "en",
    ]);
    expect(validateFormSchemaLanguages(schema, ["en", "zh"], "zh")).toEqual([
      "zh",
    ]);
    expect(validateFormSchemaLanguages(schema, ["en", "zh"])).toEqual([]);
  });
});

describe("stripFormSchemaI18n", () => {
  it("removes companions everywhere without touching base fields", () => {
    const raw = {
      version: "1.0",
      fields: [
        {
          id: "a",
          key: "ka",
          label: "Name",
          labelI18n: { zh: "姓名" },
          validation: { pattern: "^\\w+$", patternMessageI18n: { zh: "x" } },
          options: [{ label: "Free", value: "free", labelI18n: { zh: "免费" } }],
          anythingFutureI18n: { zh: "x" },
        },
      ],
      layout: {
        sections: [{ title: "Basics", titleI18n: { zh: "基本信息" }, fields: ["a"] }],
      },
    };
    const stripped = stripFormSchemaI18n(raw);
    expect(JSON.stringify(stripped)).not.toContain("I18n");
    expect(stripped).toEqual({
      version: "1.0",
      fields: [
        {
          id: "a",
          key: "ka",
          label: "Name",
          validation: { pattern: "^\\w+$" },
          options: [{ label: "Free", value: "free" }],
        },
      ],
      layout: { sections: [{ title: "Basics", fields: ["a"] }] },
    });
  });

  it("drops malformed non-object companions and leaves scalars alone", () => {
    expect(
      stripFormSchemaI18n({ fields: [{ label: "A", labelI18n: "oops" }] })
    ).toEqual({ fields: [{ label: "A" }] });
    expect(stripFormSchemaI18n("plain")).toBe("plain");
    expect(stripFormSchemaI18n(null)).toBeNull();
  });
});

describe("removeFormSchemaLanguages", () => {
  it("removes only the dropped languages and keeps the rest", () => {
    const raw = {
      version: "1.0",
      fields: [
        {
          id: "a",
          key: "ka",
          label: "Name",
          labelI18n: { zh: "姓名" },
          helpTextI18n: { zh: "幫助", fr: "aide" },
        },
      ],
      layout: { sections: [{ titleI18n: { fr: "titre" }, fields: ["a"] }] },
    };
    expect(removeFormSchemaLanguages(raw, ["zh"])).toEqual({
      version: "1.0",
      fields: [
        { id: "a", key: "ka", label: "Name", helpTextI18n: { fr: "aide" } },
      ],
      layout: { sections: [{ titleI18n: { fr: "titre" }, fields: ["a"] }] },
    });
  });

  it("does not mutate the input", () => {
    const raw = { fields: [{ labelI18n: { zh: "x" } }] };
    removeFormSchemaLanguages(raw, ["zh"]);
    expect(raw).toEqual({ fields: [{ labelI18n: { zh: "x" } }] });
  });
});
