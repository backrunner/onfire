import { describe, expect, it } from "vitest";
import {
  createEmptyFormSchema,
  isEmptyFieldValue,
  isFieldVisible,
  parseFormSchemaValue,
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
