"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { tocApi, ApiClientError } from "@/lib/api/toc-client";
import { qs } from "@/lib/api/client";
import type {
  TocCreateTicketResult,
  TocTicketTypeForm,
  TocTicketTypeNode,
} from "@/lib/toc/portal";
import { TicketPriority } from "@/lib/types";
import { isFieldVisible, isEmptyFieldValue } from "@/lib/form-schema";
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

function formFields(form: TocTicketTypeForm | null): FormFieldSchema[] {
  if (!form) return [];
  const schema = form.formSchema as { fields?: FormFieldSchema[] } | null;
  return Array.isArray(schema?.fields) ? schema.fields : [];
}

function formDefaults(form: TocTicketTypeForm | null): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {};
  for (const field of formFields(form)) {
    if (field.defaultValue === undefined) continue;
    values[field.key] = Array.isArray(field.defaultValue)
      ? field.defaultValue
      : typeof field.defaultValue === "number"
        ? String(field.defaultValue)
        : field.defaultValue;
  }
  return values;
}

interface SelectableType {
  id: string;
  label: string;
}

function flattenSelectableTypes(
  nodes: TocTicketTypeNode[],
  ancestors: string[] = []
): SelectableType[] {
  const result: SelectableType[] = [];
  for (const node of nodes) {
    const path = [...ancestors, node.name];
    if (node.selectable) result.push({ id: node.id, label: path.join(" / ") });
    result.push(...flattenSelectableTypes(node.children, path));
  }
  return result;
}

function FormFieldsSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}

export function TicketForm({ onSuccess }: TicketFormProps) {
  const { t, language } = useI18n();

  const [ticketTypes, setTicketTypes] = useState<TocTicketTypeNode[] | null>(null);
  const [typesError, setTypesError] = useState(false);
  const [activeForm, setActiveForm] = useState<TocTicketTypeForm | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Form state
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState<TicketPriority>(TicketPriority.Medium);
  const [customFields, setCustomFields] = useState<Record<string, FieldValue>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const formRequestIdRef = useRef(0);
  const selectedTypeIdRef = useRef("");

  // Turnstile
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | undefined>(undefined);

  const loadTypeForm = useCallback(async (typeId: string, preserveValues = false) => {
    const requestId = ++formRequestIdRef.current;
    setFormLoading(true);
    try {
      const form = await tocApi.get<TocTicketTypeForm>(
        `/api/toc/ticket-types/${typeId}/form${qs({ lang: language })}`
      );
      if (requestId !== formRequestIdRef.current) return;
      setActiveForm(form);
      setCustomFields((previous) => {
        const defaults = formDefaults(form);
        if (!preserveValues) return defaults;
        const validKeys = new Set(formFields(form).map((field) => field.key));
        return Object.fromEntries(
          [...Object.entries({ ...defaults, ...previous })].filter(([key]) => validKeys.has(key))
        );
      });
      setFieldErrors({});
    } catch (error) {
      if (requestId !== formRequestIdRef.current) return;
      throw error;
    } finally {
      if (requestId === formRequestIdRef.current) setFormLoading(false);
    }
  }, [language]);

  const loadTicketTypes = useCallback(async () => {
    setTicketTypes(null);
    setTypesError(false);
    try {
      const data = await tocApi.get<TocTicketTypeNode[]>(
        `/api/toc/ticket-types${qs({ lang: language })}`
      );
      const selectable = flattenSelectableTypes(data);
      const currentTypeId = selectedTypeIdRef.current;
      const nextTypeId = selectable.some((item) => item.id === currentTypeId)
        ? currentTypeId
        : selectable.length === 1
          ? selectable[0].id
          : "";
      if (nextTypeId) {
        setSelectedTypeId(nextTypeId);
        selectedTypeIdRef.current = nextTypeId;
        try {
          await loadTypeForm(nextTypeId, Boolean(currentTypeId));
        } catch (error) {
          setTicketTypes(data);
          setFormError(error instanceof Error ? error.message : t.toc.errors.loadFailed);
          return;
        }
      }
      setTicketTypes(data);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) return;
      setTypesError(true);
    }
  }, [language, loadTypeForm]);

  useEffect(() => {
    void loadTicketTypes();
  }, [loadTicketTypes]);

  const selectableTypes = useMemo(
    () => flattenSelectableTypes(ticketTypes ?? []),
    [ticketTypes]
  );

  const fields = useMemo(() => formFields(activeForm), [activeForm]);

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

  const handleTypeChange = (typeId: string) => {
    setSelectedTypeId(typeId);
    selectedTypeIdRef.current = typeId;
    setActiveForm(null);
    setFieldErrors({});
    setCustomFields({});
    setFormError("");
    void loadTypeForm(typeId).catch((error) => {
      setFormError(error instanceof Error ? error.message : t.toc.errors.loadFailed);
    });
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
    const s = t.toc.submit;
    const withN = (msg: string, n: number) => msg.replace("{{n}}", String(n));

    for (const field of visibleFields) {
      const value = customFields[field.key];
      const rules = field.validation;

      if (field.required && isEmptyFieldValue(value)) {
        errors[field.key] = s.requiredField;
        continue;
      }
      if (isEmptyFieldValue(value)) continue; // optional & empty — skip rules

      if (typeof value === "string") {
        if (field.type === "number") {
          const num = Number(value);
          if (Number.isNaN(num)) {
            errors[field.key] = s.invalidNumber;
            continue;
          }
          if (rules?.min !== undefined && num < rules.min) {
            errors[field.key] = withN(s.minValueError, rules.min);
            continue;
          }
          if (rules?.max !== undefined && num > rules.max) {
            errors[field.key] = withN(s.maxValueError, rules.max);
            continue;
          }
        } else {
          if (rules?.minLength !== undefined && value.length < rules.minLength) {
            errors[field.key] = withN(s.minLengthError, rules.minLength);
            continue;
          }
          if (rules?.maxLength !== undefined && value.length > rules.maxLength) {
            errors[field.key] = withN(s.maxLengthError, rules.maxLength);
            continue;
          }
          if (field.type === "email" && !/^\S+@\S+\.\S+$/.test(value)) {
            errors[field.key] = s.invalidFormat;
            continue;
          }
        }

        const pattern = rules?.pattern;
        if (pattern && value !== "") {
          try {
            if (!new RegExp(pattern).test(value)) {
              errors[field.key] = rules?.patternMessage || s.invalidFormat;
            }
          } catch {
            // invalid regex in the template — don't block the customer
          }
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
    setCustomFields(formDefaults(activeForm));
    setFieldErrors({});
    setFormError("");
  };

  const handleSubmit = async () => {
    setFormError("");
    if (
      !subject.trim() ||
      !content.trim() ||
      !selectedTypeId ||
      !activeForm ||
      !validate()
    ) {
      setFormError(t.toc.submit.fillRequired);
      return;
    }
    if (turnstileEnabled && !turnstileToken) {
      setFormError(t.toc.submit.captchaRequired);
      return;
    }

    setSubmitting(true);
    try {
      // Only visible fields are submitted (values typed into fields that a
      // condition later hid must not leak in), numbers as real numbers.
      const metadata: Record<string, unknown> = {};
      for (const field of visibleFields) {
        const value = customFields[field.key];
        if (value === undefined || isEmptyFieldValue(value)) continue;
        metadata[field.key] =
          field.type === "number" && typeof value === "string"
            ? Number(value)
            : value;
      }
      const result = await tocApi.post<TocCreateTicketResult>(
        `/api/toc/tickets${qs({ lang: language })}`,
        {
          ticketTypeId: selectedTypeId,
          templateVersionId: activeForm.templateVersionId,
          subject: subject.trim(),
          content: content.trim(),
          priority,
          metadata,
          turnstileToken: turnstileToken ?? undefined,
        }
      );

      resetForm();
      onSuccess(result);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) return;
      if (error instanceof ApiClientError && error.status === 409 && selectedTypeId) {
        await loadTypeForm(selectedTypeId, true).catch(() => undefined);
      }
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

  if (typesError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="font-medium">{t.toc.errors.loadFailed}</p>
          <p className="text-sm text-muted-foreground">
            {t.toc.errors.loadFailedMessage}
          </p>
          <Button variant="outline" size="sm" onClick={() => void loadTicketTypes()}>
            {t.toc.errors.retry}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (ticketTypes === null) {
    return (
      <Card aria-hidden="true">
        <CardHeader>
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-10 w-64 sm:h-5" />
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-32 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-9 w-full" />
          </div>
          <FormFieldsSkeleton />
          {turnstileEnabled && <Skeleton className="h-[65px] w-full" />}
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  const submitDisabled =
    submitting ||
    formLoading ||
    !selectedTypeId ||
    !activeForm ||
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
        <div className="space-y-2">
          <Label htmlFor="ticket-type">{t.toc.submit.ticketType}</Label>
          {selectableTypes.length > 0 ? (
            <Select value={selectedTypeId} onValueChange={handleTypeChange}>
              <SelectTrigger id="ticket-type" className="w-full">
                <SelectValue placeholder={t.toc.submit.selectTicketType} />
              </SelectTrigger>
              <SelectContent
                position="popper"
                align="start"
                className="max-w-[calc(100vw-2rem)]"
              >
                {selectableTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">{t.toc.submit.noTicketTypes}</p>
          )}
        </div>

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
            className="placeholder:text-sm"
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
            className="min-h-32 placeholder:text-sm"
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

        {formLoading && <FormFieldsSkeleton />}

        {!formLoading &&
          visibleFields.map((field) => (
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
