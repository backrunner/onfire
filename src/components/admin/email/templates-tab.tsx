"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { AlertTriangle, FileText } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api, swrFetcher, qs, ApiClientError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  EMAIL_TEMPLATE_TYPES,
  TEMPLATE_VARIABLES,
  type EmailTemplateType,
  type EmailTemplateView,
} from "./types";

const statusBadge =
  "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap";

interface EditorState {
  templateType: EmailTemplateType;
  template: EmailTemplateView | null;
  subject: string;
  body: string;
  enabled: boolean;
}

export function EmailTemplatesTab({ productId }: { productId: string }) {
  const { t } = useI18n();
  const tt = t.emailConfig.templates;

  const { data, error, isLoading, mutate } = useSWR<EmailTemplateView[]>(
    `/api/tob/admin/email-templates${qs({ productId })}`,
    swrFetcher
  );

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);

  const byType = new Map<EmailTemplateType, EmailTemplateView>();
  for (const template of data ?? []) {
    byType.set(template.templateType, template);
  }

  const openEditor = (templateType: EmailTemplateType) => {
    const template = byType.get(templateType) ?? null;
    setEditor({
      templateType,
      template,
      subject: template?.subjectTemplate ?? "",
      body: template?.bodyTemplate ?? "",
      enabled: template?.enabled ?? true,
    });
  };

  const handleSave = async () => {
    if (!editor) return;
    if (!editor.subject.trim() || !editor.body.trim()) {
      toast.error(tt.required);
      return;
    }
    setSaving(true);
    try {
      if (editor.template) {
        await api.patch(`/api/tob/admin/email-templates/${editor.template.id}`, {
          subjectTemplate: editor.subject,
          bodyTemplate: editor.body,
          enabled: editor.enabled,
        });
      } else {
        await api.post("/api/tob/admin/email-templates", {
          productId,
          templateType: editor.templateType,
          subjectTemplate: editor.subject,
          bodyTemplate: editor.body,
          enabled: editor.enabled,
        });
      }
      toast.success(tt.saved);
      setEditor(null);
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : tt.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (template: EmailTemplateView, enabled: boolean) => {
    try {
      await api.patch(`/api/tob/admin/email-templates/${template.id}`, {
        enabled,
      });
      await mutate();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : tt.saveFailed);
    }
  };

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="size-8 text-red-600 dark:text-red-400" />
          <p className="text-sm text-muted-foreground">
            {t.emailConfig.loadFailed}
          </p>
          <Button size="sm" variant="outline" onClick={() => mutate()}>
            {t.emailConfig.retry}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {EMAIL_TEMPLATE_TYPES.map((type) => (
          <Skeleton key={type} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{tt.heading}</CardTitle>
        <CardDescription className="text-xs">{tt.hint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {EMAIL_TEMPLATE_TYPES.map((type) => {
          const template = byType.get(type) ?? null;
          return (
            <div
              key={type}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5"
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm font-medium">
                {t.emailConfig.templateTypes[type]}
              </span>
              {template ? (
                <>
                  <span
                    className={cn(
                      statusBadge,
                      template.enabled
                        ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400"
                        : "bg-zinc-500/10 text-zinc-600 ring-zinc-500/20 dark:text-zinc-400"
                    )}
                  >
                    {template.enabled ? tt.enabled : tt.disabled}
                  </span>
                  <Switch
                    checked={Boolean(template.enabled)}
                    onCheckedChange={(v) => handleToggle(template, v)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => openEditor(type)}
                  >
                    {tt.edit}
                  </Button>
                </>
              ) : (
                <>
                  <span
                    className={cn(
                      statusBadge,
                      "bg-zinc-500/10 text-zinc-600 ring-zinc-500/20 dark:text-zinc-400"
                    )}
                  >
                    {tt.notCreated}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => openEditor(type)}
                  >
                    {tt.create}
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </CardContent>

      {/* Editor dialog */}
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => !open && setEditor(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editor?.template ? tt.editTitle : tt.createTitle}
              {editor && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {t.emailConfig.templateTypes[editor.templateType]}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {editor && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{tt.subject}</Label>
                <Input
                  value={editor.subject}
                  onChange={(e) =>
                    setEditor({ ...editor, subject: e.target.value })
                  }
                  placeholder={tt.subjectPlaceholder}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tt.body}</Label>
                <Textarea
                  value={editor.body}
                  onChange={(e) =>
                    setEditor({ ...editor, body: e.target.value })
                  }
                  placeholder={tt.bodyPlaceholder}
                  rows={10}
                  className="font-mono text-xs"
                />
              </div>
              <div className="rounded-md bg-muted/60 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  {tt.variablesHint}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {TEMPLATE_VARIABLES.map((variable) => (
                    <code
                      key={variable}
                      className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground ring-1 ring-inset ring-border"
                    >
                      {"{{"}
                      {variable}
                      {"}}"}
                    </code>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="template-enabled"
                  checked={editor.enabled}
                  onCheckedChange={(v) => setEditor({ ...editor, enabled: v })}
                />
                <Label htmlFor="template-enabled" className="text-xs">
                  {tt.enabledLabel}
                </Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditor(null)}
            >
              {t.common.cancel}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
