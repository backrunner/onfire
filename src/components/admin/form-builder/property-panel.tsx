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
import { useI18n } from "@/lib/i18n";
import { Plus, Trash2 } from "lucide-react";

// Radix Select forbids empty-string item values; sentinel for "no condition".
const ALWAYS = "__always__";

const OPERATORS: ConditionOperator[] = [
  "equals",
  "notEquals",
  "contains",
  "isEmpty",
  "isNotEmpty",
];

interface PropertyPanelProps {
  field: FormFieldSchema | null;
  allFields: FormFieldSchema[];
  onChange: (field: FormFieldSchema) => void;
  onDelete: () => void;
  /** When set, the panel edits only the translatable text companions for this
   * language; structural properties stay in the default language. */
  translationLang?: string | null;
}

/** Translation-only panel: text companions of the selected field. */
function TranslationPanel({
  field,
  lang,
  onChange,
}: {
  field: FormFieldSchema;
  lang: string;
  onChange: (field: FormFieldSchema) => void;
}) {
  const { t } = useI18n();
  const fb = t.formBuilder;
  const hasOptions = ["select", "radio", "checkbox"].includes(field.type);

  const readI18n = (map: Record<string, string> | undefined) => map?.[lang] ?? "";
  const writeI18n = (
    key: "labelI18n" | "placeholderI18n" | "helpTextI18n" | "descriptionI18n",
    value: string
  ) => {
    const map = { ...(field[key] ?? {}) };
    if (value.trim()) map[lang] = value;
    else delete map[lang];
    onChange({ ...field, [key]: Object.keys(map).length > 0 ? map : undefined });
  };
  const writeOptionLabel = (index: number, value: string) => {
    const options = [...(field.options ?? [])];
    const option = options[index];
    const map = { ...(option.labelI18n ?? {}) };
    if (value.trim()) map[lang] = value;
    else delete map[lang];
    options[index] = {
      ...option,
      labelI18n: Object.keys(map).length > 0 ? map : undefined,
    };
    onChange({ ...field, options });
  };
  const writePatternMessage = (value: string) => {
    const map = { ...(field.validation?.patternMessageI18n ?? {}) };
    if (value.trim()) map[lang] = value;
    else delete map[lang];
    onChange({
      ...field,
      validation: {
        ...field.validation,
        patternMessageI18n: Object.keys(map).length > 0 ? map : undefined,
      },
    });
  };

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-sm font-medium">
        {fb.fieldProperties} · {t.languages[lang as keyof typeof t.languages] ?? lang}
      </h3>
      <Separator />

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="i18n-label">{fb.label}</Label>
          <Input
            id="i18n-label"
            className="h-8"
            value={readI18n(field.labelI18n)}
            placeholder={field.label}
            onChange={(e) => writeI18n("labelI18n", e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="i18n-placeholder">{fb.placeholder}</Label>
          <Input
            id="i18n-placeholder"
            className="h-8"
            value={readI18n(field.placeholderI18n)}
            placeholder={field.placeholder || undefined}
            onChange={(e) => writeI18n("placeholderI18n", e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="i18n-helpText">{fb.helpText}</Label>
          <Textarea
            id="i18n-helpText"
            value={readI18n(field.helpTextI18n)}
            placeholder={field.helpText || undefined}
            onChange={(e) => writeI18n("helpTextI18n", e.target.value)}
            rows={2}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="i18n-description">{fb.description}</Label>
          <Textarea
            id="i18n-description"
            value={readI18n(field.descriptionI18n)}
            placeholder={field.description || undefined}
            onChange={(e) => writeI18n("descriptionI18n", e.target.value)}
            rows={2}
          />
        </div>

        {field.validation?.pattern && (
          <div className="space-y-1.5">
            <Label htmlFor="i18n-patternMessage">{fb.patternMessage}</Label>
            <Input
              id="i18n-patternMessage"
              className="h-8"
              value={readI18n(field.validation.patternMessageI18n)}
              placeholder={field.validation.patternMessage || undefined}
              onChange={(e) => writePatternMessage(e.target.value)}
            />
          </div>
        )}
      </div>

      {hasOptions && (
        <>
          <Separator />
          <div className="space-y-3">
            <Label>{fb.options}</Label>
            <div className="space-y-2">
              {(field.options || []).map((option, index) => (
                <div key={index} className="space-y-1">
                  <p className="truncate text-xs text-muted-foreground">
                    {option.label}
                    <span className="ml-1 text-muted-foreground/60">({option.value})</span>
                  </p>
                  <Input
                    className="h-8"
                    value={readI18n(option.labelI18n)}
                    placeholder={option.label}
                    onChange={(e) => writeOptionLabel(index, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function PropertyPanel({
  field,
  allFields,
  onChange,
  onDelete,
  translationLang,
}: PropertyPanelProps) {
  const { t } = useI18n();
  const fb = t.formBuilder;

  if (!field) {
    return (
      <div className="flex min-h-24 items-center justify-center p-4 text-center text-sm text-muted-foreground md:h-full">
        {fb.selectFieldHint}
      </div>
    );
  }

  if (translationLang) {
    return <TranslationPanel field={field} lang={translationLang} onChange={onChange} />;
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
      {
        label: fb.defaultOption.replace(
          "{{n}}",
          String((field.options?.length || 0) + 1)
        ),
        value: "",
      },
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
        <h3 className="text-sm font-medium">{fb.fieldProperties}</h3>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-destructive hover:text-destructive"
          onClick={onDelete}
          aria-label={t.common.delete}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <Separator />

      {/* Basic Properties */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="label">{fb.label}</Label>
          <Input
            id="label"
            className="h-8"
            value={field.label}
            onChange={(e) => updateField({ label: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="key">{fb.fieldKey}</Label>
          <Input
            id="key"
            className="h-8"
            value={field.key}
            onChange={(e) => updateField({ key: e.target.value })}
            placeholder="unique_field_key"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="placeholder">{fb.placeholder}</Label>
          <Input
            id="placeholder"
            className="h-8"
            value={field.placeholder || ""}
            onChange={(e) => updateField({ placeholder: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="helpText">{fb.helpText}</Label>
          <Textarea
            id="helpText"
            value={field.helpText || ""}
            onChange={(e) => updateField({ helpText: e.target.value })}
            rows={2}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="required">{fb.required}</Label>
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
              <Label>{fb.options}</Label>
              <Button variant="outline" size="sm" className="h-7" onClick={addOption}>
                <Plus className="size-3.5" />
                {fb.add}
              </Button>
            </div>
            <div className="space-y-2">
              {(field.options || []).map((option, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder={fb.optionLabel}
                    value={option.label}
                    onChange={(e) =>
                      updateOption(index, { label: e.target.value })
                    }
                    className="h-8 flex-1"
                  />
                  <Input
                    placeholder={fb.optionValue}
                    value={option.value}
                    onChange={(e) =>
                      updateOption(index, { value: e.target.value })
                    }
                    className="h-8 flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => removeOption(index)}
                    aria-label={t.common.delete}
                  >
                    <Trash2 className="size-4" />
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
        <Label>{fb.validation}</Label>

        {(field.type === "text" || field.type === "textarea") && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="minLength" className="text-xs">
                  {fb.minLength}
                </Label>
                <Input
                  id="minLength"
                  type="number"
                  className="h-8"
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
                  {fb.maxLength}
                </Label>
                <Input
                  id="maxLength"
                  type="number"
                  className="h-8"
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
                {fb.pattern}
              </Label>
              <Input
                id="pattern"
                className="h-8"
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
                {fb.minValue}
              </Label>
              <Input
                id="min"
                type="number"
                className="h-8"
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
                {fb.maxValue}
              </Label>
              <Input
                id="max"
                type="number"
                className="h-8"
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
            <Label>{fb.conditional}</Label>
            <div className="space-y-2">
              <Select
                value={field.condition?.fieldId || ALWAYS}
                onValueChange={(value) =>
                  updateField({
                    condition:
                      value !== ALWAYS
                        ? {
                            fieldId: value,
                            operator: field.condition?.operator || "equals",
                            value: field.condition?.value,
                          }
                        : undefined,
                  })
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder={fb.conditionField} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALWAYS}>{fb.alwaysShow}</SelectItem>
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
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATORS.map((op) => (
                        <SelectItem key={op} value={op}>
                          {fb.operators[op]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {!["isEmpty", "isNotEmpty"].includes(
                    field.condition.operator
                  ) && (
                    <Input
                      placeholder={fb.optionValue}
                      className="h-8"
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
