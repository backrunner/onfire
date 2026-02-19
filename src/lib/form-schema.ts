/**
 * Form Schema Types for Template Editor
 *
 * Defines the structure for dynamic form fields used in ticket templates.
 */

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
 * Validate a form schema
 */
export function validateFormSchema(schema: FormSchema): string[] {
  const errors: string[] = [];

  if (schema.version !== "1.0") {
    errors.push("Invalid schema version");
  }

  const keys = new Set<string>();
  const ids = new Set<string>();

  for (const field of schema.fields) {
    if (!field.id) {
      errors.push(`Field missing id`);
    } else if (ids.has(field.id)) {
      errors.push(`Duplicate field id: ${field.id}`);
    } else {
      ids.add(field.id);
    }

    if (!field.key) {
      errors.push(`Field ${field.id} missing key`);
    } else if (keys.has(field.key)) {
      errors.push(`Duplicate field key: ${field.key}`);
    } else {
      keys.add(field.key);
    }

    if (!field.label) {
      errors.push(`Field ${field.key} missing label`);
    }

    if (!field.type) {
      errors.push(`Field ${field.key} missing type`);
    }

    // Validate options for select/radio/checkbox
    if (["select", "radio", "checkbox"].includes(field.type)) {
      if (!field.options || field.options.length === 0) {
        errors.push(`Field ${field.key} requires options`);
      }
    }

    // Validate condition references
    if (field.condition?.fieldId) {
      if (!ids.has(field.condition.fieldId) &&
          !schema.fields.some(f => f.id === field.condition?.fieldId)) {
        errors.push(`Field ${field.key} references non-existent field in condition`);
      }
    }
  }

  return errors;
}

/**
 * Parse a JSON string into a FormSchema
 */
export function parseFormSchema(json: string): FormSchema | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed.version === "1.0" && Array.isArray(parsed.fields)) {
      return parsed as FormSchema;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a field should be visible based on conditions
 */
export function isFieldVisible(
  field: FormFieldSchema,
  formData: Record<string, unknown>
): boolean {
  if (!field.condition) return true;

  const { fieldId, operator, value } = field.condition;
  const fieldValue = formData[fieldId];

  switch (operator) {
    case "equals":
      return fieldValue === value;
    case "notEquals":
      return fieldValue !== value;
    case "contains":
      return typeof fieldValue === "string" && fieldValue.includes(String(value));
    case "isEmpty":
      return fieldValue === undefined || fieldValue === null || fieldValue === "";
    case "isNotEmpty":
      return fieldValue !== undefined && fieldValue !== null && fieldValue !== "";
    default:
      return true;
  }
}
