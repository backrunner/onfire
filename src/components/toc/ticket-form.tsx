"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { tocApi, ApiClientError } from "@/lib/api/toc-client";
import type { TocCreateTicketResult, TocTemplate } from "@/lib/toc/portal";
import { TicketPriority } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DynamicFormField, type FormFieldSchema } from "./dynamic-form-field";
import {
  TurnstileWidget,
  turnstileEnabled,
  type TurnstileInstance,
} from "./turnstile-widget";

type FieldValue = string | string[] | boolean;

interface TicketFormProps {
  onSuccess: (result: TocCreateTicketResult) => void;
}

function templateFields(template: TocTemplate | null): FormFieldSchema[] {
  if (!template) return [];
  const schema = template.formSchema as { fields?: FormFieldSchema[] } | null;
  return Array.isArray(schema?.fields) ? schema.fields : [];
}

function isFieldVisible(
  field: FormFieldSchema,
  valuesById: Record<string, FieldValue | undefined>
): boolean {
  if (!field.condition) return true;
  const { fieldId, operator, value } = field.condition;
  const current = valuesById[fieldId];
  switch (operator) {
    case "equals":
      return current === value;
    case "notEquals":
      return current !== value;
    case "contains":
      return typeof current === "string" && current.includes(String(value));
    case "isEmpty":
      return current === undefined || current === null || current === "";
    case "isNotEmpty":
      return current !== undefined && current !== null && current !== "";
    default:
      return true;
  }
}

function isEmptyValue(value: FieldValue | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false; // booleans count as filled
}

export function TicketForm({ onSuccess }: TicketFormProps) {
  const { t } = useI18n();

  // Templates
  const [templates, setTemplates] = useState<TocTemplate[] | null>(null);
  const [templatesError, setTemplatesError] = useState(false);

  // Form state
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState<TicketPriority>(TicketPriority.Medium);
  const [customFields, setCustomFields] = useState<Record<string, FieldValue>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Turnstile
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);

  const loadTemplates = useCallback(async () => {
    setTemplates(null);
    setTemplatesError(false);
    try {
      const data = await tocApi.get<TocTemplate[]>("/api/toc/templates");
      setTemplates(data);
      if (data.length === 1) setSelectedTemplateId(data[0].id);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) return;
      setTemplatesError(true);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const selectedTemplate = useMemo(
    () => templates?.find((tpl) => tpl.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId]
  );

  const fields = useMemo(() => templateFields(selectedTemplate), [selectedTemplate]);

  const valuesById = useMemo(() => {
    const map: Record<string, FieldValue | undefined> = {};
    for (const field of fields) {
      map[field.id ?? field.key] = customFields[field.key];
    }
    return map;
  }, [fields, customFields]);

  const visibleFields = useMemo(
    () => fields.filter((field) => isFieldVisible(field, valuesById)),
    [fields, valuesById]
  );

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setCategory("");
    setFieldErrors({});
    // Seed defaults from the newly selected template's schema.
    const next: Record<string, FieldValue> = {};
    const tpl = templates?.find((item) => item.id === templateId) ?? null;
    for (const field of templateFields(tpl)) {
      if (field.defaultValue !== undefined) {
        next[field.key] = Array.isArray(field.defaultValue)
          ? field.defaultValue
          : typeof field.defaultValue === "number"
            ? String(field.defaultValue)
            : field.defaultValue;
      }
    }
    setCustomFields(next);
  };

  const setFieldValue = (key: string, value: FieldValue) => {
    setCustomFields((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    for (const field of visibleFields) {
      const value = customFields[field.key];
      if (field.required && isEmptyValue(value)) {
        errors[field.key] = t.toc.submit.requiredField;
        continue;
      }
      const pattern = field.validation?.pattern;
      if (pattern && typeof value === "string" && value !== "") {
        try {
          if (!new RegExp(pattern).test(value)) {
            errors[field.key] =
              field.validation?.patternMessage || t.toc.submit.invalidFormat;
          }
        } catch {
          // invalid regex in the template — don't block the customer
        }
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetForm = () => {
    setSubject("");
    setContent("");
    setPriority(TicketPriority.Medium);
    setCustomFields({});
    setFieldErrors({});
    setCategory("");
    setFormError("");
  };

  const handleSubmit = async () => {
    setFormError("");
    if (!subject.trim() || !content.trim() || !validate()) {
      setFormError(t.toc.submit.fillRequired);
      return;
    }
    if (turnstileEnabled && !turnstileToken) {
      setFormError(t.toc.submit.captchaRequired);
      return;
    }

    setSubmitting(true);
    try {
      const metadata: Record<string, unknown> = { ...customFields };
      if (category) metadata.category = category;

      const result = await tocApi.post<TocCreateTicketResult>("/api/toc/tickets", {
        templateId: selectedTemplate?.id || undefined,
        subject: subject.trim(),
        content: content.trim(),
        priority,
        metadata,
        turnstileToken: turnstileToken ?? undefined,
      });

      resetForm();
      onSuccess(result);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) return;
      const message =
        error instanceof ApiClientError ? error.message : t.toc.submit.submitFailed;
      setFormError(message);
      toast.error(t.toc.submit.submitFailed);
    } finally {
      // Tokens are single-use — always request a fresh one.
      setTurnstileToken(null);
      turnstileRef.current?.reset();
      setSubmitting(false);
    }
  };

  if (templatesError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="font-medium">{t.toc.errors.loadFailed}</p>
          <p className="text-sm text-muted-foreground">
            {t.toc.errors.loadFailedMessage}
          </p>
          <Button variant="outline" size="sm" onClick={() => void loadTemplates()}>
            {t.toc.errors.retry}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (templates === null) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  const submitDisabled =
    submitting ||
    !subject.trim() ||
    !content.trim() ||
    (turnstileEnabled && !turnstileToken);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.toc.submit.title}</CardTitle>
        <CardDescription>{t.toc.submit.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {templates.length > 1 && (
          <div className="space-y-2">
            <Label>{t.toc.submit.template}</Label>
            <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t.toc.submit.selectTemplate} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selectedTemplate && selectedTemplate.categories.length > 0 && (
          <div className="space-y-2">
            <Label>{t.toc.submit.category}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t.toc.submit.selectCategory} />
              </SelectTrigger>
              <SelectContent>
                {selectedTemplate.categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label>
            {t.toc.submit.subject}
            <span className="text-destructive">*</span>
          </Label>
          <Input
            value={subject}
            maxLength={500}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t.toc.submit.subjectPlaceholder}
          />
        </div>

        <div className="space-y-2">
          <Label>
            {t.toc.submit.content}
            <span className="text-destructive">*</span>
          </Label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t.toc.submit.contentPlaceholder}
            className="min-h-32"
          />
        </div>

        <div className="space-y-2">
          <Label>{t.toc.submit.priority}</Label>
          <Select
            value={priority}
            onValueChange={(v) => setPriority(v as TicketPriority)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(TicketPriority).map((p) => (
                <SelectItem key={p} value={p}>
                  {t.tickets.priority[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {visibleFields.map((field) => (
          <DynamicFormField
            key={field.id ?? field.key}
            field={field}
            value={customFields[field.key] ?? ""}
            onChange={(value) => setFieldValue(field.key, value)}
            error={fieldErrors[field.key]}
          />
        ))}

        <TurnstileWidget widgetRef={turnstileRef} onToken={setTurnstileToken} />

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        <Button onClick={handleSubmit} disabled={submitDisabled} className="w-full">
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t.toc.submit.submitting}
            </>
          ) : (
            <>
              <Send className="size-4" />
              {t.common.submit}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
