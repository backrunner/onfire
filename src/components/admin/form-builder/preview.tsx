"use client";

import { useState } from "react";
import { FormSchema, FormFieldSchema, isFieldVisible } from "@/lib/form-schema";
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

interface PreviewProps {
  schema: FormSchema;
}

export function Preview({ schema }: PreviewProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  const updateField = (key: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const renderField = (field: FormFieldSchema) => {
    // Check visibility condition
    if (!isFieldVisible(field, formData)) {
      return null;
    }

    const value = formData[field.key];

    switch (field.type) {
      case "text":
      case "email":
        return (
          <Input
            type={field.type}
            placeholder={field.placeholder}
            value={(value as string) || ""}
            onChange={(e) => updateField(field.key, e.target.value)}
          />
        );

      case "number":
        return (
          <Input
            type="number"
            placeholder={field.placeholder}
            value={(value as number) ?? ""}
            onChange={(e) =>
              updateField(
                field.key,
                e.target.value ? parseFloat(e.target.value) : ""
              )
            }
            min={field.validation?.min}
            max={field.validation?.max}
            step={field.config?.step}
          />
        );

      case "textarea":
        return (
          <Textarea
            placeholder={field.placeholder}
            value={(value as string) || ""}
            onChange={(e) => updateField(field.key, e.target.value)}
            rows={field.config?.rows || 3}
          />
        );

      case "select":
        return (
          <Select
            value={(value as string) || ""}
            onValueChange={(v) => updateField(field.key, v)}
          >
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder || "Select..."} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((option) => (
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
            {field.options?.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  type="radio"
                  name={field.key}
                  value={option.value}
                  checked={value === option.value}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  className="h-4 w-4"
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </div>
        );

      case "checkbox":
        if (field.options && field.options.length > 0) {
          // Multiple checkboxes
          const selectedValues = (value as string[]) || [];
          return (
            <div className="space-y-2">
              {field.options.map((option) => (
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
                      updateField(field.key, newValues);
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
              onCheckedChange={(checked) => updateField(field.key, checked)}
            />
            <span className="text-sm">{field.label}</span>
          </div>
        );

      case "date":
        return (
          <Input
            type="date"
            value={(value as string) || ""}
            onChange={(e) => updateField(field.key, e.target.value)}
          />
        );

      default:
        return null;
    }
  };

  if (schema.fields.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        Add fields to see the preview
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {schema.fields.map((field) => {
        const fieldElement = renderField(field);
        if (!fieldElement) return null;

        return (
          <div key={field.id} className="space-y-1.5">
            {field.type !== "checkbox" ||
            (field.options && field.options.length > 0) ? (
              <Label>
                {field.label}
                {field.required && (
                  <span className="text-destructive ml-1">*</span>
                )}
              </Label>
            ) : null}
            {fieldElement}
            {field.helpText && (
              <p className="text-xs text-muted-foreground">{field.helpText}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
