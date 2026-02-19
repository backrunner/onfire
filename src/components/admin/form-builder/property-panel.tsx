"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormFieldSchema,
  FormFieldOption,
  ConditionOperator,
} from "@/lib/form-schema";
import { Plus, Trash2 } from "lucide-react";

interface PropertyPanelProps {
  field: FormFieldSchema | null;
  allFields: FormFieldSchema[];
  onChange: (field: FormFieldSchema) => void;
  onDelete: () => void;
}

export function PropertyPanel({
  field,
  allFields,
  onChange,
  onDelete,
}: PropertyPanelProps) {
  if (!field) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Select a field to edit its properties
      </div>
    );
  }

  const updateField = (updates: Partial<FormFieldSchema>) => {
    onChange({ ...field, ...updates });
  };

  const updateValidation = (
    key: string,
    value: string | number | undefined
  ) => {
    onChange({
      ...field,
      validation: {
        ...field.validation,
        [key]: value,
      },
    });
  };

  const updateOption = (index: number, updates: Partial<FormFieldOption>) => {
    const newOptions = [...(field.options || [])];
    newOptions[index] = { ...newOptions[index], ...updates };
    onChange({ ...field, options: newOptions });
  };

  const addOption = () => {
    const newOptions = [
      ...(field.options || []),
      { label: `Option ${(field.options?.length || 0) + 1}`, value: "" },
    ];
    onChange({ ...field, options: newOptions });
  };

  const removeOption = (index: number) => {
    const newOptions = (field.options || []).filter((_, i) => i !== index);
    onChange({ ...field, options: newOptions });
  };

  const hasOptions = ["select", "radio", "checkbox"].includes(field.type);
  const otherFields = allFields.filter((f) => f.id !== field.id);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Field Properties</h3>
        <Button variant="destructive" size="sm" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      {/* Basic Properties */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="label">Label</Label>
          <Input
            id="label"
            value={field.label}
            onChange={(e) => updateField({ label: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="key">Field Key</Label>
          <Input
            id="key"
            value={field.key}
            onChange={(e) => updateField({ key: e.target.value })}
            placeholder="unique_field_key"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="placeholder">Placeholder</Label>
          <Input
            id="placeholder"
            value={field.placeholder || ""}
            onChange={(e) => updateField({ placeholder: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="helpText">Help Text</Label>
          <Textarea
            id="helpText"
            value={field.helpText || ""}
            onChange={(e) => updateField({ helpText: e.target.value })}
            rows={2}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="required">Required</Label>
          <Switch
            id="required"
            checked={field.required || false}
            onCheckedChange={(checked) => updateField({ required: checked })}
          />
        </div>
      </div>

      {/* Options (for select, radio, checkbox) */}
      {hasOptions && (
        <>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Options</Label>
              <Button variant="outline" size="sm" onClick={addOption}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {(field.options || []).map((option, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="Label"
                    value={option.label}
                    onChange={(e) =>
                      updateOption(index, { label: e.target.value })
                    }
                    className="flex-1"
                  />
                  <Input
                    placeholder="Value"
                    value={option.value}
                    onChange={(e) =>
                      updateOption(index, { value: e.target.value })
                    }
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeOption(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Validation */}
      <Separator />
      <div className="space-y-3">
        <Label>Validation</Label>

        {(field.type === "text" || field.type === "textarea") && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="minLength" className="text-xs">
                  Min Length
                </Label>
                <Input
                  id="minLength"
                  type="number"
                  value={field.validation?.minLength || ""}
                  onChange={(e) =>
                    updateValidation(
                      "minLength",
                      e.target.value ? parseInt(e.target.value) : undefined
                    )
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxLength" className="text-xs">
                  Max Length
                </Label>
                <Input
                  id="maxLength"
                  type="number"
                  value={field.validation?.maxLength || ""}
                  onChange={(e) =>
                    updateValidation(
                      "maxLength",
                      e.target.value ? parseInt(e.target.value) : undefined
                    )
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pattern" className="text-xs">
                Regex Pattern
              </Label>
              <Input
                id="pattern"
                value={field.validation?.pattern || ""}
                onChange={(e) => updateValidation("pattern", e.target.value)}
                placeholder="^[a-zA-Z]+$"
              />
            </div>
          </>
        )}

        {field.type === "number" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="min" className="text-xs">
                Min Value
              </Label>
              <Input
                id="min"
                type="number"
                value={field.validation?.min ?? ""}
                onChange={(e) =>
                  updateValidation(
                    "min",
                    e.target.value ? parseFloat(e.target.value) : undefined
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max" className="text-xs">
                Max Value
              </Label>
              <Input
                id="max"
                type="number"
                value={field.validation?.max ?? ""}
                onChange={(e) =>
                  updateValidation(
                    "max",
                    e.target.value ? parseFloat(e.target.value) : undefined
                  )
                }
              />
            </div>
          </div>
        )}
      </div>

      {/* Conditional Display */}
      {otherFields.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <Label>Conditional Display</Label>
            <div className="space-y-2">
              <Select
                value={field.condition?.fieldId || ""}
                onValueChange={(value) =>
                  updateField({
                    condition: value
                      ? {
                          fieldId: value,
                          operator: field.condition?.operator || "equals",
                          value: field.condition?.value,
                        }
                      : undefined,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Show when field..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Always show</SelectItem>
                  {otherFields.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {field.condition?.fieldId && (
                <>
                  <Select
                    value={field.condition.operator}
                    onValueChange={(value) =>
                      updateField({
                        condition: {
                          ...field.condition!,
                          operator: value as ConditionOperator,
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equals">Equals</SelectItem>
                      <SelectItem value="notEquals">Not Equals</SelectItem>
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="isEmpty">Is Empty</SelectItem>
                      <SelectItem value="isNotEmpty">Is Not Empty</SelectItem>
                    </SelectContent>
                  </Select>

                  {!["isEmpty", "isNotEmpty"].includes(
                    field.condition.operator
                  ) && (
                    <Input
                      placeholder="Value"
                      value={String(field.condition.value || "")}
                      onChange={(e) =>
                        updateField({
                          condition: {
                            ...field.condition!,
                            value: e.target.value,
                          },
                        })
                      }
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
