"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TicketPriority } from "@/lib/types";
import { DynamicFormField, FormFieldSchema } from "./dynamic-form-field";
import { Send, Loader2 } from "lucide-react";

interface Template {
  id: string;
  title: string;
  categories: string[];
  formSchema?: {
    fields?: FormFieldSchema[];
  };
}

interface TicketFormProps {
  productId: string;
  token: string;
  templates: Template[];
  onSuccess?: (ticketId: string) => void;
}

export function TicketForm({ productId, token, templates, onSuccess }: TicketFormProps) {
  const { t } = useI18n();
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState<TicketPriority>(TicketPriority.Medium);
  const [customFields, setCustomFields] = useState<Record<string, string | string[] | boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleTemplateChange = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    setSelectedTemplate(template || null);
    setSelectedCategory("");
    setCustomFields({});
  };

  const handleCustomFieldChange = (key: string, value: string | string[] | boolean) => {
    setCustomFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!subject.trim() || !content.trim()) {
      setError(t.common.required);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const metadata: Record<string, unknown> = { ...customFields };
      if (selectedCategory) {
        metadata.category = selectedCategory;
      }

      const res = await fetch("/api/toc/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productId,
          templateId: selectedTemplate?.id,
          subject,
          content,
          priority,
          metadata,
        }),
      });

      const data = (await res.json()) as { ok: boolean; data?: { id: string }; error?: string };

      if (data.ok && data.data) {
        setSubject("");
        setContent("");
        setPriority(TicketPriority.Medium);
        setCustomFields({});
        setSelectedTemplate(null);
        setSelectedCategory("");
        onSuccess?.(data.data.id);
      } else {
        setError(data.error || t.errors.unknownError);
      }
    } catch (err) {
      setError(t.errors.networkError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.toc.submit?.title || "Submit a Ticket"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {templates.length > 0 && (
          <div className="space-y-2">
            <Label>{t.toc.submit?.template || "Template"}</Label>
            <Select
              value={selectedTemplate?.id || ""}
              onValueChange={handleTemplateChange}
            >
              <SelectTrigger>
                <SelectValue placeholder={t.toc.submit?.selectTemplate || "Select a template"} />
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
            <Label>{t.toc.submit?.category || "Category"}</Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue placeholder={t.toc.submit?.selectCategory || "Select a category"} />
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
          <Label>{t.toc.submit?.subject || "Subject"} *</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t.toc.submit?.subjectPlaceholder || "Brief description of your issue"}
          />
        </div>

        <div className="space-y-2">
          <Label>{t.toc.submit?.content || "Description"} *</Label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t.toc.submit?.contentPlaceholder || "Please describe your issue in detail"}
            className="min-h-[120px]"
          />
        </div>

        <div className="space-y-2">
          <Label>{t.common.priority}</Label>
          <Select
            value={priority}
            onValueChange={(v) => setPriority(v as TicketPriority)}
          >
            <SelectTrigger>
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

        {selectedTemplate?.formSchema?.fields?.map((field) => (
          <DynamicFormField
            key={field.key}
            field={field}
            value={customFields[field.key] || ""}
            onChange={(value) => handleCustomFieldChange(field.key, value)}
          />
        ))}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          onClick={handleSubmit}
          disabled={submitting || !subject.trim() || !content.trim()}
          className="w-full"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          {t.common.submit}
        </Button>
      </CardContent>
    </Card>
  );
}
