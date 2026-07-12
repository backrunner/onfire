/**
 * Form Schema Types for Template Editor
 *
 * Defines the structure for dynamic form fields used in ticket templates.
 */
import { z } from "zod";

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
  /** Field key used in form data */
  key: string;
  /** Display label */
  label: string;
  /** Field type */
  type: FormFieldType;
  /** Field description/help text */
  description?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Help text shown below the field */
  helpText?: string;
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
  /** Description for the section */
  description?: string;
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

const formFieldSchema = z.object({
  id: z.string().trim().min(1).max(128),
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(200),
  type: fieldTypeSchema,
  description: z.string().max(1_000).optional(),
  required: z.boolean().optional(),
  placeholder: z.string().max(500).optional(),
  helpText: z.string().max(1_000).optional(),
  validation: z
    .object({
      minLength: z.number().int().min(0).max(10_000).optional(),
      maxLength: z.number().int().min(1).max(10_000).optional(),
      pattern: z.string().max(256).optional(),
      patternMessage: z.string().max(500).optional(),
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
            description: z.string().max(1_000).optional(),
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
