"use client";

import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

/** Normalize legacy string options and drop entries without a value. */
function normalizeOptions(
  options?: string[] | Array<{ label: string; value: string }>
): Array<{ label: string; value: string }> {
  if (!options || options.length === 0) return [];
  const normalized =
    typeof options[0] === "string"
      ? (options as string[]).map((opt) => ({ label: opt, value: opt }))
      : (options as Array<{ label: string; value: string }>);
  return normalized.filter((option) => option.value);
}

export function DynamicFormField({ field, value, onChange, error }: DynamicFormFieldProps) {
  const { t } = useI18n();
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
            maxLength={field.validation?.maxLength}
          />
        );

      case "select":
        return (
          <Select value={(value as string) || ""} onValueChange={onChange}>
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={field.placeholder || t.toc.submit.selectOption}
              />
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
          <RadioGroup
            value={(value as string) || ""}
            onValueChange={onChange}
            className="gap-2"
          >
            {options.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2"
              >
                <RadioGroupItem value={option.value} />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </RadioGroup>
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
                  className="flex cursor-pointer items-center gap-2"
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
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox
              checked={(value as boolean) || false}
              onCheckedChange={(checked) => onChange(!!checked)}
            />
            <span className="text-sm">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </span>
          </label>
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
            maxLength={field.validation?.maxLength}
          />
        );
    }
  };

  // Single checkbox renders its own inline label
  const showLabel = field.type !== "checkbox" || options.length > 0;

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
