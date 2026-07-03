"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Form field schema — supports both the template editor format
// (src/lib/form-schema.ts, with `id` + option objects) and the legacy
// format (string options, no id).
export interface FormFieldSchema {
  id?: string;
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "email" | "select" | "radio" | "checkbox" | "date";
  required?: boolean;
  placeholder?: string;
  description?: string;
  options?: string[] | Array<{ label: string; value: string }>;
  helpText?: string;
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
    patternMessage?: string;
  };
  condition?: {
    fieldId: string;
    operator: "equals" | "notEquals" | "contains" | "isEmpty" | "isNotEmpty";
    value?: unknown;
  };
  config?: {
    rows?: number;
    step?: number;
  };
  defaultValue?: string | number | boolean | string[];
}

interface DynamicFormFieldProps {
  field: FormFieldSchema;
  value: string | string[] | boolean;
  onChange: (value: string | string[] | boolean) => void;
  error?: string;
}

export function DynamicFormField({ field, value, onChange, error }: DynamicFormFieldProps) {
  // Normalize options to the new format
  const normalizeOptions = (options?: string[] | Array<{ label: string; value: string }>) => {
    if (!options) return [];
    if (typeof options[0] === "string") {
      return (options as string[]).map((opt) => ({ label: opt, value: opt }));
    }
    return options as Array<{ label: string; value: string }>;
  };

  const options = normalizeOptions(field.options);

  const renderField = () => {
    switch (field.type) {
      case "textarea":
        return (
          <Textarea
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="min-h-[80px]"
            rows={field.config?.rows || 3}
            minLength={field.validation?.minLength}
            maxLength={field.validation?.maxLength}
          />
        );

      case "select":
        return (
          <Select value={(value as string) || ""} onValueChange={onChange}>
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder || "Select..."} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "radio":
        return (
          <div className="space-y-2">
            {options.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="radio"
                  name={field.key}
                  value={option.value}
                  checked={value === option.value}
                  onChange={(e) => onChange(e.target.value)}
                  className="h-4 w-4"
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </div>
        );

      case "checkbox":
        if (options.length > 0) {
          // Multiple checkboxes
          const selectedValues = Array.isArray(value) ? value : [];
          return (
            <div className="space-y-2">
              {options.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedValues.includes(option.value)}
                    onCheckedChange={(checked) => {
                      const newValues = checked
                        ? [...selectedValues, option.value]
                        : selectedValues.filter((v) => v !== option.value);
                      onChange(newValues);
                    }}
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          );
        }
        // Single checkbox
        return (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={(value as boolean) || false}
              onCheckedChange={(checked) => onChange(!!checked)}
            />
            <span className="text-sm">{field.label}</span>
          </div>
        );

      case "number":
        return (
          <Input
            type="number"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            min={field.validation?.min}
            max={field.validation?.max}
            step={field.config?.step}
          />
        );

      case "email":
        return (
          <Input
            type="email"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
          />
        );

      case "date":
        return (
          <Input
            type="date"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      default:
        return (
          <Input
            type="text"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            minLength={field.validation?.minLength}
            maxLength={field.validation?.maxLength}
          />
        );
    }
  };

  // Don't show label for single checkbox (it's shown inline)
  const showLabel = field.type !== "checkbox" || (field.options && field.options.length > 0);

  return (
    <div className="space-y-2">
      {showLabel && (
        <Label>
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}
      {renderField()}
      {(field.helpText || field.description) && (
        <p className="text-xs text-muted-foreground">
          {field.helpText || field.description}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
