/**
 * Form Schema Types for Template Editor
 *
 * Defines the structure for dynamic form fields used in ticket templates.
 */
import { z } from "zod";
import { i18nRecordSchema } from "@/lib/i18n-schema";

// ============================================
// Field Types
// ============================================

export type FormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "email"
  | "select"
  | "radio"
  | "checkbox"
  | "date";

// ============================================
// Validation Rules
// ============================================

export interface FormFieldValidation {
  /** Minimum length for text fields */
  minLength?: number;
  /** Maximum length for text fields */
  maxLength?: number;
  /** Regex pattern for validation */
  pattern?: string;
  /** Pattern error message */
  patternMessage?: string;
  /** Per-language pattern error messages (missing keys fall back to patternMessage) */
  patternMessageI18n?: Record<string, string>;
  /** Minimum value for number fields */
  min?: number;
  /** Maximum value for number fields */
  max?: number;
}

// ============================================
// Conditional Display
// ============================================

export type ConditionOperator = "equals" | "notEquals" | "contains" | "isEmpty" | "isNotEmpty";

export interface FormFieldCondition {
  /** ID of the field to check */
  fieldId: string;
  /** Comparison operator */
  operator: ConditionOperator;
  /** Value to compare against (not needed for isEmpty/isNotEmpty) */
  value?: unknown;
}

// ============================================
// Field Options (for select, radio, checkbox)
// ============================================

export interface FormFieldOption {
  /** Display label */
  label: string;
  /** Stored value */
  value: string;
  /** Per-language option labels (value is never translated) */
  labelI18n?: Record<string, string>;
}

// ============================================
// Field Configuration
// ============================================

export interface FormFieldConfig {
  /** Number of rows for textarea */
  rows?: number;
  /** Step value for number input */
  step?: number;
  /** Allow multiple selection (for select) */
  multiple?: boolean;
  /** Date format (for date fields) */
  dateFormat?: string;
}

// ============================================
// Form Field Schema
// ============================================

export interface FormFieldSchema {
  /** Unique identifier for the field */
  id: string;
  /** Field key used in form data (never translated) */
  key: string;
  /** Display label */
  label: string;
  /** Per-language labels (missing keys fall back to label) */
  labelI18n?: Record<string, string>;
  /** Field type */
  type: FormFieldType;
  /** Field description/help text */
  description?: string;
  /** Per-language descriptions */
  descriptionI18n?: Record<string, string>;
  /** Whether the field is required */
  required?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Per-language placeholders */
  placeholderI18n?: Record<string, string>;
  /** Help text shown below the field */
  helpText?: string;
  /** Per-language help texts */
  helpTextI18n?: Record<string, string>;
  /** Validation rules */
  validation?: FormFieldValidation;
  /** Conditional display rules */
  condition?: FormFieldCondition;
  /** Options for select/radio/checkbox fields */
  options?: FormFieldOption[];
  /** Additional field configuration */
  config?: FormFieldConfig;
  /** Default value */
  defaultValue?: string | number | boolean | string[];
}

// ============================================
// Layout Configuration
// ============================================

export interface FormSection {
  /** Section title (optional) */
  title?: string;
  /** Per-language section titles */
  titleI18n?: Record<string, string>;
  /** Description for the section */
  description?: string;
  /** Per-language section descriptions */
  descriptionI18n?: Record<string, string>;
  /** Field IDs in this section */
  fields: string[];
}

export interface FormLayout {
  /** Number of columns (1, 2, or 3) */
  columns?: 1 | 2 | 3;
  /** Sections for grouping fields */
  sections?: FormSection[];
}

// ============================================
// Complete Form Schema
// ============================================

export interface FormSchema {
  /** Schema version for compatibility */
  version: "1.0";
  /** Form fields */
  fields: FormFieldSchema[];
  /** Layout configuration */
  layout?: FormLayout;
}

const fieldTypeSchema = z.enum([
  "text",
  "textarea",
  "number",
  "email",
  "select",
  "radio",
  "checkbox",
  "date",
]);

/** Shape-only check for per-language companions; language keys are validated
 * against the product's supported languages at the service layer. */
const i18nShortMapSchema = i18nRecordSchema(200);
const i18nMediumMapSchema = i18nRecordSchema(500);
const i18nLongMapSchema = i18nRecordSchema(1000);

const formFieldSchema = z.object({
  id: z.string().trim().min(1).max(128),
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(200),
  labelI18n: i18nShortMapSchema.optional(),
  type: fieldTypeSchema,
  description: z.string().max(1_000).optional(),
  descriptionI18n: i18nLongMapSchema.optional(),
  required: z.boolean().optional(),
  placeholder: z.string().max(500).optional(),
  placeholderI18n: i18nMediumMapSchema.optional(),
  helpText: z.string().max(1_000).optional(),
  helpTextI18n: i18nLongMapSchema.optional(),
  validation: z
    .object({
      minLength: z.number().int().min(0).max(10_000).optional(),
      maxLength: z.number().int().min(1).max(10_000).optional(),
      pattern: z.string().max(256).optional(),
      patternMessage: z.string().max(500).optional(),
      patternMessageI18n: i18nMediumMapSchema.optional(),
      min: z.number().finite().optional(),
      max: z.number().finite().optional(),
    })
    .optional(),
  condition: z
    .object({
      fieldId: z.string().min(1).max(128),
      operator: z.enum([
        "equals",
        "notEquals",
        "contains",
        "isEmpty",
        "isNotEmpty",
      ]),
      value: z.unknown().optional(),
    })
    .optional(),
  options: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(200),
        value: z.string().trim().min(1).max(200),
        labelI18n: i18nShortMapSchema.optional(),
      })
    )
    .max(100)
    .optional(),
  config: z
    .object({
      rows: z.number().int().min(1).max(20).optional(),
      step: z.number().positive().finite().optional(),
      multiple: z.boolean().optional(),
      dateFormat: z.string().max(100).optional(),
    })
    .optional(),
  defaultValue: z
    .union([
      z.string().max(10_000),
      z.number().finite(),
      z.boolean(),
      z.array(z.string().max(200)).max(100),
    ])
    .optional(),
});

const storedFormSchema = z.object({
  version: z.literal("1.0"),
  fields: z.array(formFieldSchema).max(50),
  layout: z
    .object({
      columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      sections: z
        .array(
          z.object({
            title: z.string().max(200).optional(),
            titleI18n: i18nShortMapSchema.optional(),
            description: z.string().max(1_000).optional(),
            descriptionI18n: i18nLongMapSchema.optional(),
            fields: z.array(z.string().max(128)).max(50),
          })
        )
        .max(20)
        .optional(),
    })
    .optional(),
});

/** Parse and bound the schema persisted by the template APIs. */
export function parseFormSchemaValue(value: unknown): FormSchema | null {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  ) {
    return createEmptyFormSchema();
  }
  const parsed = storedFormSchema.safeParse(value);
  return parsed.success ? (parsed.data as FormSchema) : null;
}

/**
 * Project a stored schema into a single language: every `*I18n` companion
 * overrides its base field when it has an entry for `lang`, otherwise the
 * base field (product default language) is kept. The i18n companions are
 * stripped so the projected schema is clean for customer-facing delivery.
 */
export function localizeFormSchema(schema: FormSchema, lang: string): FormSchema {
  const fields = schema.fields.map((field) => {
    const localized: FormFieldSchema = {
      ...field,
      label: field.labelI18n?.[lang] ?? field.label,
      description: field.descriptionI18n?.[lang] ?? field.description,
      placeholder: field.placeholderI18n?.[lang] ?? field.placeholder,
      helpText: field.helpTextI18n?.[lang] ?? field.helpText,
    };
    delete localized.labelI18n;
    delete localized.descriptionI18n;
    delete localized.placeholderI18n;
    delete localized.helpTextI18n;
    if (field.validation) {
      const validation: FormFieldValidation = {
        ...field.validation,
        patternMessage:
          field.validation.patternMessageI18n?.[lang] ??
          field.validation.patternMessage,
      };
      delete validation.patternMessageI18n;
      localized.validation = validation;
    }
    if (field.options) {
      localized.options = field.options.map((option) => {
        const localizedOption: FormFieldOption = {
          ...option,
          label: option.labelI18n?.[lang] ?? option.label,
        };
        delete localizedOption.labelI18n;
        return localizedOption;
      });
    }
    return localized;
  });
  const layout = schema.layout
    ? {
        ...schema.layout,
        sections: schema.layout.sections?.map((section) => {
          const localizedSection: FormSection = {
            ...section,
            title: section.titleI18n?.[lang] ?? section.title,
            description: section.descriptionI18n?.[lang] ?? section.description,
          };
          delete localizedSection.titleI18n;
          delete localizedSection.descriptionI18n;
          return localizedSection;
        }),
      }
    : undefined;
  return { ...schema, fields, layout };
}

/**
 * Merge the i18n companions of `previous` into `next`, used when a generated
 * draft (which carries no translations) replaces the working schema. A field
 * keeps its previous companions when its id matches and the base text is
 * unchanged; options match by value, sections by title. Inputs are not
 * mutated.
 */
export function mergeFormSchemaI18n(
  previous: FormSchema,
  next: FormSchema
): FormSchema {
  const previousFields = new Map(previous.fields.map((f) => [f.id, f]));
  const fields = next.fields.map((field) => {
    const prev = previousFields.get(field.id);
    if (!prev) return field;
    const merged: FormFieldSchema = { ...field };
    if (merged.label === prev.label && prev.labelI18n) {
      merged.labelI18n = prev.labelI18n;
    }
    if (merged.description === prev.description && prev.descriptionI18n) {
      merged.descriptionI18n = prev.descriptionI18n;
    }
    if (merged.placeholder === prev.placeholder && prev.placeholderI18n) {
      merged.placeholderI18n = prev.placeholderI18n;
    }
    if (merged.helpText === prev.helpText && prev.helpTextI18n) {
      merged.helpTextI18n = prev.helpTextI18n;
    }
    if (
      merged.validation &&
      prev.validation &&
      merged.validation.patternMessage === prev.validation.patternMessage &&
      prev.validation.patternMessageI18n
    ) {
      merged.validation = {
        ...merged.validation,
        patternMessageI18n: prev.validation.patternMessageI18n,
      };
    }
    if (merged.options && prev.options) {
      const previousOptions = new Map(prev.options.map((o) => [o.value, o]));
      merged.options = merged.options.map((option) => {
        const prevOption = previousOptions.get(option.value);
        return prevOption &&
          option.label === prevOption.label &&
          prevOption.labelI18n
          ? { ...option, labelI18n: prevOption.labelI18n }
          : option;
      });
    }
    return merged;
  });
  const layout = next.layout
    ? {
        ...next.layout,
        sections: next.layout.sections?.map((section) => {
          const prev = previous.layout?.sections?.find(
            (s) => (s.title ?? "") === (section.title ?? "")
          );
          if (!prev) return section;
          const merged: FormSection = { ...section };
          if (prev.titleI18n) merged.titleI18n = prev.titleI18n;
          if (merged.description === prev.description && prev.descriptionI18n) {
            merged.descriptionI18n = prev.descriptionI18n;
          }
          return merged;
        }),
      }
    : undefined;
  return { ...next, fields, layout };
}

/**
 * Recursively rewrite `*I18n` companion maps inside a loosely-parsed schema
 * value. Companions that are not plain objects are always dropped: they are
 * never valid, and the ToC surface must not leak them.
 */
function rewriteI18nCompanions(
  value: unknown,
  rewrite: (map: Record<string, unknown>) => Record<string, unknown>
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteI18nCompanions(entry, rewrite));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key.endsWith("I18n")) {
        if (entry && typeof entry === "object" && !Array.isArray(entry)) {
          const rewritten = rewrite(entry as Record<string, unknown>);
          if (Object.keys(rewritten).length > 0) out[key] = rewritten;
        }
        continue;
      }
      out[key] = rewriteI18nCompanions(entry, rewrite);
    }
    return out;
  }
  return value;
}

/**
 * Strip every `*I18n` companion map from a loosely-parsed schema value. Used
 * by the ToC fallback path, which must never expose translation maps even
 * when the stored schema no longer passes the strict zod parse.
 */
export function stripFormSchemaI18n(value: unknown): unknown {
  return rewriteI18nCompanions(value, () => ({}));
}

/**
 * Remove `langs` from every `*I18n` companion map inside a loosely-parsed
 * schema value; companions left empty are dropped entirely (matching the
 * "empty companions are not stored" convention).
 */
export function removeFormSchemaLanguages(
  value: unknown,
  langs: string[]
): unknown {
  const removed = new Set(langs);
  return rewriteI18nCompanions(value, (map) => {
    const kept: Record<string, unknown> = {};
    for (const [lang, text] of Object.entries(map)) {
      if (!removed.has(lang)) kept[lang] = text;
    }
    return kept;
  });
}

/**
 * Collect the language keys used by i18n companion fields that are not in
 * `supportedLanguages`. An empty result means the schema is valid; an empty
 * supported set forbids all i18n keys. When `defaultLanguage` is given, a
 * companion key equal to it is also reported: the base fields already carry
 * the authoritative default-language text and must not be overridden.
 */
export function validateFormSchemaLanguages(
  schema: FormSchema,
  supportedLanguages: string[],
  defaultLanguage?: string
): string[] {
  const supported = new Set(supportedLanguages);
  const unsupported = new Set<string>();
  const collect = (map: Record<string, string> | undefined) => {
    if (!map) return;
    for (const lang of Object.keys(map)) {
      if (!supported.has(lang) || lang === defaultLanguage) {
        unsupported.add(lang);
      }
    }
  };
  for (const field of schema.fields) {
    collect(field.labelI18n);
    collect(field.descriptionI18n);
    collect(field.placeholderI18n);
    collect(field.helpTextI18n);
    collect(field.validation?.patternMessageI18n);
    for (const option of field.options ?? []) collect(option.labelI18n);
  }
  for (const section of schema.layout?.sections ?? []) {
    collect(section.titleI18n);
    collect(section.descriptionI18n);
  }
  return [...unsupported].sort();
}

export interface SubmissionError {
  field: string;
  message: string;
}

/** Enforce template field constraints at the API boundary, not only in UI. */
export function validateFormSubmission(
  schema: FormSchema,
  values: Record<string, unknown>
): SubmissionError[] {
  const errors: SubmissionError[] = [];
  const valuesById: Record<string, unknown> = {};
  for (const field of schema.fields) valuesById[field.id] = values[field.key];

  for (const field of schema.fields) {
    if (!isFieldVisible(field, valuesById)) continue;
    const value = values[field.key];
    if (field.required && isEmptyFieldValue(value)) {
      errors.push({ field: field.key, message: "Required field is missing" });
      continue;
    }
    if (isEmptyFieldValue(value)) continue;

    const rules = field.validation;
    if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors.push({ field: field.key, message: "Expected a number" });
        continue;
      }
      if (rules?.min !== undefined && value < rules.min) {
        errors.push({ field: field.key, message: "Value is below the minimum" });
      }
      if (rules?.max !== undefined && value > rules.max) {
        errors.push({ field: field.key, message: "Value exceeds the maximum" });
      }
      continue;
    }

    if (field.type === "checkbox") {
      const validValues = new Set((field.options ?? []).map((option) => option.value));
      if (validValues.size === 0) {
        if (typeof value !== "boolean") {
          errors.push({ field: field.key, message: "Expected a boolean" });
        }
      } else if (
        !Array.isArray(value) ||
        value.some((item) => typeof item !== "string" || !validValues.has(item))
      ) {
        errors.push({ field: field.key, message: "Invalid selected option" });
      }
      continue;
    }

    if (typeof value !== "string" || value.length > 10_000) {
      errors.push({ field: field.key, message: "Expected a bounded string" });
      continue;
    }
    if (rules?.minLength !== undefined && value.length < rules.minLength) {
      errors.push({ field: field.key, message: "Value is too short" });
    }
    if (rules?.maxLength !== undefined && value.length > rules.maxLength) {
      errors.push({ field: field.key, message: "Value is too long" });
    }
    if (field.type === "email" && !/^\S+@\S+\.\S+$/.test(value)) {
      errors.push({ field: field.key, message: "Invalid email address" });
    }
    if (field.type === "select" || field.type === "radio") {
      const allowed = new Set((field.options ?? []).map((option) => option.value));
      if (!allowed.has(value)) {
        errors.push({ field: field.key, message: "Invalid selected option" });
      }
    }
    if (rules?.pattern) {
      try {
        if (!new RegExp(rules.pattern).test(value)) {
          errors.push({ field: field.key, message: "Value has an invalid format" });
        }
      } catch {
        errors.push({ field: field.key, message: "Template pattern is invalid" });
      }
    }
  }
  return errors;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Create a new empty form schema
 */
export function createEmptyFormSchema(): FormSchema {
  return {
    version: "1.0",
    fields: [],
  };
}

/**
 * Create a new field with default values
 */
export function createField(type: FormFieldType, key: string): FormFieldSchema {
  return {
    id: crypto.randomUUID(),
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    type,
    required: false,
  };
}

/**
 * Validate a form schema. Returns structured errors so callers can
 * localize them (see `formBuilder.errors` in the locales).
 */
export interface SchemaError {
  code:
    | "missingId"
    | "duplicateId"
    | "missingKey"
    | "duplicateKey"
    | "missingLabel"
    | "missingType"
    | "needsOptions"
    | "emptyOptionValue"
    | "duplicateOptionValue"
    | "badCondition";
  /** Field key (or id fallback) the error belongs to. */
  field: string;
}

export function validateFormSchema(schema: FormSchema): SchemaError[] {
  const errors: SchemaError[] = [];

  const keys = new Set<string>();
  const ids = new Set<string>();
  for (const field of schema.fields) {
    if (field.id) ids.add(field.id);
  }

  const seenIds = new Set<string>();
  for (const field of schema.fields) {
    const name = field.key || field.id || "?";

    if (!field.id) {
      errors.push({ code: "missingId", field: name });
    } else if (seenIds.has(field.id)) {
      errors.push({ code: "duplicateId", field: name });
    } else {
      seenIds.add(field.id);
    }

    if (!field.key || !field.key.trim()) {
      errors.push({ code: "missingKey", field: name });
    } else if (keys.has(field.key)) {
      errors.push({ code: "duplicateKey", field: field.key });
    } else {
      keys.add(field.key);
    }

    if (!field.label) {
      errors.push({ code: "missingLabel", field: name });
    }

    if (!field.type) {
      errors.push({ code: "missingType", field: name });
    }

    // Options for select/radio/checkbox: required, non-empty values, unique
    if (["select", "radio", "checkbox"].includes(field.type)) {
      const options = field.options ?? [];
      if (options.length === 0) {
        errors.push({ code: "needsOptions", field: name });
      } else {
        const values = new Set<string>();
        for (const option of options) {
          if (!option.value || !option.value.trim()) {
            errors.push({ code: "emptyOptionValue", field: name });
            break;
          }
          if (values.has(option.value)) {
            errors.push({ code: "duplicateOptionValue", field: name });
            break;
          }
          values.add(option.value);
        }
      }
    }

    // Condition must reference an existing field
    if (field.condition?.fieldId && !ids.has(field.condition.fieldId)) {
      errors.push({ code: "badCondition", field: name });
    }
  }

  return errors;
}

/**
 * Parse a JSON string into a FormSchema
 */
export function parseFormSchema(json: string): FormSchema | null {
  try {
    return parseFormSchemaValue(JSON.parse(json));
  } catch {
    return null;
  }
}

/**
 * True when a value counts as "not filled in": undefined, null, empty
 * string, empty array, or an unchecked boolean (single checkbox).
 */
export function isEmptyFieldValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "boolean") return !value;
  return false;
}

const normalize = (value: unknown): string =>
  value === undefined || value === null ? "" : String(value);

/**
 * Check if a field should be visible based on its condition.
 *
 * `valuesById` must be keyed by the *referenced field's id* (conditions
 * store `fieldId`). Comparisons are string-coerced so number inputs and
 * string condition values match; array values (multi-checkbox) match when
 * the selection includes the condition value.
 */
export function isFieldVisible(
  field: Pick<FormFieldSchema, "condition">,
  valuesById: Record<string, unknown>
): boolean {
  if (!field.condition) return true;

  const { fieldId, operator, value } = field.condition;
  const fieldValue = valuesById[fieldId];

  switch (operator) {
    case "equals":
      return Array.isArray(fieldValue)
        ? fieldValue.map(normalize).includes(normalize(value))
        : normalize(fieldValue) === normalize(value);
    case "notEquals":
      return Array.isArray(fieldValue)
        ? !fieldValue.map(normalize).includes(normalize(value))
        : normalize(fieldValue) !== normalize(value);
    case "contains":
      return Array.isArray(fieldValue)
        ? fieldValue.map(normalize).includes(normalize(value))
        : normalize(fieldValue).includes(normalize(value));
    case "isEmpty":
      return isEmptyFieldValue(fieldValue);
    case "isNotEmpty":
      return !isEmptyFieldValue(fieldValue);
    default:
      return true;
  }
}
