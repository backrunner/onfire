"use client";

import { useMemo, useState, useCallback } from "react";
import {
  FormSchema,
  FormFieldSchema,
  FormFieldType,
  createField,
  createEmptyFormSchema,
  localizeFormSchema,
  validateFormSchema,
  type SchemaError,
} from "@/lib/form-schema";
import { useI18n } from "@/lib/i18n";
import { api, ApiClientError } from "@/lib/api/client";
import { toast } from "sonner";
import { FieldPalette } from "./field-palette";
import { Canvas } from "./canvas";
import { PropertyPanel } from "./property-panel";
import { Preview } from "./preview";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Save, Eye, FileJson, Upload, AlertCircle, Sparkles } from "lucide-react";

interface FormBuilderProps {
  initialSchema?: FormSchema;
  onSave: (schema: FormSchema) => void;
  /** Product language context. When the product enables 2+ languages the
   * builder gains a language switch: the default language edits structure,
   * other languages edit only the translatable text companions. */
  productId?: string;
  defaultLanguage?: string;
  supportedLanguages?: string[];
}

const TRANSLATION_BATCH_SIZE = 40;

/** Stable request ids for the translate-content endpoint. */
function collectTranslatableTexts(schema: FormSchema) {
  const texts: Array<{ id: string; text: string }> = [];
  const push = (id: string, value: string | undefined) => {
    if (value?.trim()) texts.push({ id, text: value.trim() });
  };
  for (const field of schema.fields) {
    push(`f:${field.id}:label`, field.label);
    push(`f:${field.id}:placeholder`, field.placeholder);
    push(`f:${field.id}:helpText`, field.helpText);
    push(`f:${field.id}:description`, field.description);
    push(`f:${field.id}:patternMessage`, field.validation?.patternMessage);
    field.options?.forEach((option, index) =>
      push(`f:${field.id}:option:${index}`, option.label)
    );
  }
  schema.layout?.sections?.forEach((section, index) => {
    push(`s:${index}:title`, section.title);
    push(`s:${index}:description`, section.description);
  });
  return texts;
}

/** Merge translate-content results into the schema's i18n companions. */
function applyTranslations(
  prev: FormSchema,
  translations: Record<string, Record<string, string>>,
  targets: string[]
): FormSchema {
  const lookup = (id: string): Record<string, string> | null => {
    const entry = translations[id];
    if (!entry) return null;
    const values: Record<string, string> = {};
    for (const lang of targets) {
      if (entry[lang]) values[lang] = entry[lang];
    }
    return Object.keys(values).length > 0 ? values : null;
  };
  const merge = (
    base: Record<string, string> | undefined,
    add: Record<string, string> | null
  ) => (add ? { ...base, ...add } : base);

  const fields = prev.fields.map((field) => {
    const next: FormFieldSchema = { ...field };
    next.labelI18n = merge(field.labelI18n, lookup(`f:${field.id}:label`));
    next.placeholderI18n = merge(
      field.placeholderI18n,
      lookup(`f:${field.id}:placeholder`)
    );
    next.helpTextI18n = merge(field.helpTextI18n, lookup(`f:${field.id}:helpText`));
    next.descriptionI18n = merge(
      field.descriptionI18n,
      lookup(`f:${field.id}:description`)
    );
    const patternMessage = lookup(`f:${field.id}:patternMessage`);
    if (patternMessage && field.validation) {
      next.validation = {
        ...field.validation,
        patternMessageI18n: merge(field.validation.patternMessageI18n, patternMessage),
      };
    }
    if (field.options) {
      next.options = field.options.map((option, index) => {
        const label = lookup(`f:${field.id}:option:${index}`);
        return label ? { ...option, labelI18n: merge(option.labelI18n, label) } : option;
      });
    }
    return next;
  });
  const layout = prev.layout
    ? {
        ...prev.layout,
        sections: prev.layout.sections?.map((section, index) => ({
          ...section,
          titleI18n: merge(section.titleI18n, lookup(`s:${index}:title`)),
          descriptionI18n: merge(
            section.descriptionI18n,
            lookup(`s:${index}:description`)
          ),
        })),
      }
    : undefined;
  return { ...prev, fields, layout };
}

export function FormBuilder({
  initialSchema,
  onSave,
  productId,
  defaultLanguage,
  supportedLanguages,
}: FormBuilderProps) {
  const { t } = useI18n();
  const fb = t.formBuilder;
  const [schema, setSchema] = useState<FormSchema>(
    initialSchema || createEmptyFormSchema()
  );
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<SchemaError[]>([]);
  const [translating, setTranslating] = useState(false);

  const languages = useMemo(() => {
    if (!supportedLanguages || supportedLanguages.length < 2) return null;
    const primary = defaultLanguage ?? supportedLanguages[0];
    return [primary, ...supportedLanguages.filter((lang) => lang !== primary)];
  }, [supportedLanguages, defaultLanguage]);
  const [editLang, setEditLang] = useState(defaultLanguage ?? "en");
  const activeLang = languages?.includes(editLang) ? editLang : (languages?.[0] ?? "en");
  const translationLang = languages && activeLang !== languages[0] ? activeLang : null;

  // The canvas and preview show the text projected into the active language;
  // structural edits still act on the full schema.
  const displaySchema = useMemo(
    () => (translationLang ? localizeFormSchema(schema, translationLang) : schema),
    [schema, translationLang]
  );

  const handleTranslateAll = async () => {
    if (!languages || !productId) return;
    const sourceLang = languages[0];
    const targets = languages.slice(1);
    const texts = collectTranslatableTexts(schema);
    if (targets.length === 0 || texts.length === 0) return;
    setTranslating(true);
    try {
      const translations: Record<string, Record<string, string>> = {};
      for (let offset = 0; offset < texts.length; offset += TRANSLATION_BATCH_SIZE) {
        const result = await api.post<{
          translations: Record<string, Record<string, string>>;
        }>("/api/tob/admin/ai/translate-content", {
          productId,
          sourceLang,
          targetLangs: targets,
          texts: texts.slice(offset, offset + TRANSLATION_BATCH_SIZE),
        });
        Object.assign(translations, result.translations);
      }
      setSchema((prev) => applyTranslations(prev, translations, targets));
      toast.success(t.management.translation.applied);
      setEditLang(targets[0]);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 503) {
        toast.error(t.management.translation.notConfigured);
      } else {
        toast.error(t.management.translation.failed);
      }
    } finally {
      setTranslating(false);
    }
  };

  const formatError = useCallback(
    (error: SchemaError) =>
      fb.errors[error.code].replace("{{field}}", error.field),
    [fb.errors]
  );

  const selectedField = schema.fields.find((f) => f.id === selectedFieldId);

  const handleAddField = useCallback(
    (type: FormFieldType) => {
      const key = `field_${Date.now()}`;
      const newField = createField(type, key);

      // Add default options for select/radio/checkbox
      if (["select", "radio", "checkbox"].includes(type)) {
        newField.options = [1, 2].map((n) => ({
          label: fb.defaultOption.replace("{{n}}", String(n)),
          value: `option${n}`,
        }));
      }

      setSchema((prev) => ({
        ...prev,
        fields: [...prev.fields, newField],
      }));
      setSelectedFieldId(newField.id);
    },
    [fb.defaultOption]
  );

  const handleUpdateField = useCallback((updatedField: FormFieldSchema) => {
    setSchema((prev) => ({
      ...prev,
      fields: prev.fields.map((f) =>
        f.id === updatedField.id ? updatedField : f
      ),
    }));
  }, []);

  const handleDeleteField = useCallback((id: string) => {
    setSchema((prev) => ({
      ...prev,
      fields: prev.fields.filter((f) => f.id !== id),
    }));
    setSelectedFieldId(null);
  }, []);

  const handleReorderFields = useCallback((fields: FormFieldSchema[]) => {
    setSchema((prev) => ({ ...prev, fields }));
  }, []);

  const handleSave = () => {
    const errors = validateFormSchema(schema);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);
    onSave(schema);
  };

  const handleImportJson = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (parsed.version !== "1.0" || !Array.isArray(parsed.fields)) {
        setImportError(fb.invalidSchema);
        return;
      }
      const errors = validateFormSchema(parsed);
      if (errors.length > 0) {
        setImportError(errors.map(formatError).join("; "));
        return;
      }
      setSchema(parsed);
      setImportError(null);
      setJsonInput("");
    } catch {
      setImportError(fb.invalidJson);
    }
  };

  const handleExportJson = () => {
    const json = JSON.stringify(schema, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "form-schema.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3 sm:p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button size="sm" className="h-8" onClick={handleSave}>
            <Save className="size-4" />
            {t.common.save}
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Eye className="size-4" />
                {fb.preview}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
              <DialogHeader>
                <DialogTitle>{fb.previewTitle}</DialogTitle>
              </DialogHeader>
              <Preview schema={displaySchema} />
            </DialogContent>
          </Dialog>

          {languages && (
            <>
              <Tabs value={activeLang} onValueChange={setEditLang}>
                <TabsList className="h-8">
                  {languages.map((lang) => (
                    <TabsTrigger key={lang} value={lang} className="px-2.5 text-xs">
                      {t.languages[lang as keyof typeof t.languages] ?? lang}
                      {lang === languages[0] ? ` · ${fb.defaultTag}` : ""}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              {productId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => void handleTranslateAll()}
                  disabled={translating}
                >
                  <Sparkles className="size-4" />
                  {translating
                    ? t.management.translation.translating
                    : t.management.translation.translateAll}
                </Button>
              )}
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Upload className="size-4" />
                {fb.import}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{fb.importTitle}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Textarea
                  placeholder={fb.importPlaceholder}
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  rows={10}
                />
                {importError && (
                  <p className="text-sm text-destructive">{importError}</p>
                )}
                <Button onClick={handleImportJson} className="w-full">
                  {fb.import}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button variant="outline" size="sm" className="h-8" onClick={handleExportJson}>
            <FileJson className="size-4" />
            {fb.export}
          </Button>
        </div>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="p-4 bg-destructive/10 border-b border-destructive/20">
          <div className="flex items-start gap-2 text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">{fb.fixErrors}</p>
              <ul className="list-disc list-inside mt-1">
                {validationErrors.map((error, i) => (
                  <li key={i}>{formatError(error)}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="min-h-0 flex-1 overflow-y-auto md:flex md:overflow-hidden">
        {/* Left Panel - Field Palette */}
        <div className="w-full border-b p-3 md:w-56 md:shrink-0 md:overflow-auto md:border-r md:border-b-0 md:p-4">
          <FieldPalette onAddField={handleAddField} disabled={Boolean(translationLang)} />
        </div>

        {/* Center - Canvas */}
        <div className="flex min-h-80 w-full flex-col overflow-hidden p-3 md:min-h-0 md:min-w-0 md:flex-1 md:p-4">
          {translationLang && (
            <p className="mb-2 text-xs text-muted-foreground">
              {fb.translationModeHint}
            </p>
          )}
          <Tabs defaultValue="edit" className="flex min-h-0 flex-1 flex-col">
            <TabsList>
              <TabsTrigger value="edit">{fb.editTab}</TabsTrigger>
              <TabsTrigger value="preview">{fb.previewTab}</TabsTrigger>
            </TabsList>
            <TabsContent value="edit" className="flex-1 flex mt-4">
              <Canvas
                fields={displaySchema.fields}
                selectedFieldId={selectedFieldId}
                onSelectField={setSelectedFieldId}
                onReorderFields={handleReorderFields}
                onDeleteField={handleDeleteField}
                readOnly={Boolean(translationLang)}
              />
            </TabsContent>
            <TabsContent value="preview" className="flex-1 mt-4 overflow-auto">
              <div className="max-w-xl mx-auto p-4 border rounded-lg">
                <Preview schema={displaySchema} />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Panel - Property Editor */}
        <div className="w-full border-t md:w-72 md:shrink-0 md:overflow-auto md:border-t-0 md:border-l">
          <PropertyPanel
            field={selectedField || null}
            allFields={schema.fields}
            onChange={handleUpdateField}
            onDelete={() => selectedFieldId && handleDeleteField(selectedFieldId)}
            translationLang={translationLang}
          />
        </div>
      </div>
    </div>
  );
}
