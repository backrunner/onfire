"use client";

import { useMemo, useState, type ComponentType } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  AlignLeft,
  AlertTriangle,
  Code2,
  FileText,
  Minimize2,
  Monitor,
  RotateCcw,
  Smartphone,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api, swrFetcher, qs } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  EMAIL_TEMPLATE_SAMPLE_VARIABLES,
  getDefaultBodyTemplate,
  getDefaultSubjectTemplate,
  renderEmailTemplate,
  sanitizeEmailTemplateHtml,
} from "@/lib/email-templates";
import {
  EMAIL_TEMPLATE_TYPES,
  TEMPLATE_VARIABLES,
  type EmailTemplateType,
  type EmailTemplateView,
} from "./types";
import type {
  EmailTemplateEditorApi,
  MonacoTemplateEditorProps,
} from "./monaco-template-editor";
import { showEmailMutationFailure } from "./toast";

type MonacoTemplateEditorModule = typeof import("./monaco-template-editor");

let monacoTemplateEditorPromise: Promise<MonacoTemplateEditorModule> | null =
  null;

function loadMonacoTemplateEditor(): Promise<MonacoTemplateEditorModule> {
  if (!monacoTemplateEditorPromise) {
    monacoTemplateEditorPromise = import("./monaco-template-editor").catch(
      (error) => {
        monacoTemplateEditorPromise = null;
        throw error;
      }
    );
  }
  return monacoTemplateEditorPromise;
}

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
  const [previewMobile, setPreviewMobile] = useState(false);
  const [mobilePanel, setMobilePanel] =
    useState<"editor" | "preview">("editor");
  const [MonacoTemplateEditor, setMonacoTemplateEditor] =
    useState<ComponentType<MonacoTemplateEditorProps> | null>(null);
  const [bodyEditorApi, setBodyEditorApi] =
    useState<EmailTemplateEditorApi | null>(null);
  const [editorLoadFailed, setEditorLoadFailed] = useState(false);

  const byType = new Map<EmailTemplateType, EmailTemplateView>();
  for (const template of data ?? []) {
    byType.set(template.templateType, template);
  }

  const ensureMonacoEditor = () => {
    setEditorLoadFailed(false);
    void loadMonacoTemplateEditor()
      .then((module) => {
        setMonacoTemplateEditor(() => module.MonacoTemplateEditor);
      })
      .catch(() => {
        setEditorLoadFailed(true);
        toast.error(tt.editorLoadFailed);
      });
  };

  const openEditor = (templateType: EmailTemplateType) => {
    const template = byType.get(templateType) ?? null;
    setEditor({
      templateType,
      template,
      subject:
        template?.subjectTemplate ?? getDefaultSubjectTemplate(templateType),
      body: template?.bodyTemplate ?? getDefaultBodyTemplate(templateType),
      enabled: template?.enabled ?? true,
    });
    setBodyEditorApi(null);
    setPreviewMobile(false);
    setMobilePanel("editor");
    ensureMonacoEditor();
  };

  const preview = useMemo(() => {
    if (!editor) return null;
    const subject = renderEmailTemplate(
      editor.subject,
      EMAIL_TEMPLATE_SAMPLE_VARIABLES,
      { html: false }
    );
    const body = renderEmailTemplate(
      sanitizeEmailTemplateHtml(editor.body),
      EMAIL_TEMPLATE_SAMPLE_VARIABLES,
      { html: true }
    );
    return {
      subject,
      srcDoc: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><style>html,body{margin:0;min-height:100%;background:#f4f4f5}body{padding:24px 12px;box-sizing:border-box}</style></head><body>${body}</body></html>`,
    };
  }, [editor]);

  const resetToDefault = () => {
    if (!editor) return;
    setEditor({
      ...editor,
      subject: getDefaultSubjectTemplate(editor.templateType),
      body: getDefaultBodyTemplate(editor.templateType),
    });
  };

  const insertVariable = (variable: string) => {
    if (bodyEditorApi) {
      bodyEditorApi.insertVariable(variable);
      return;
    }
    setEditor((current) =>
      current
        ? { ...current, body: `${current.body}{{${variable}}}` }
        : current
    );
  };

  const handleSave = async () => {
    if (!editor) return;
    if (!editor.subject.trim() || !editor.body.trim()) {
      toast.warning(tt.required);
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
      showEmailMutationFailure(err, tt.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (
    template: EmailTemplateView,
    enabled: boolean
  ) => {
    try {
      await api.patch(`/api/tob/admin/email-templates/${template.id}`, {
        enabled,
      });
      await mutate();
    } catch (err) {
      showEmailMutationFailure(err, tt.saveFailed);
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
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 py-4">
        <CardTitle className="text-base">{tt.heading}</CardTitle>
        <CardDescription className="text-xs">{tt.hint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 px-5 pb-4">
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
                    {tt.systemDefault}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => openEditor(type)}
                  >
                    {tt.customize}
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
        <DialogContent className="flex max-h-[calc(100vh-2rem)] min-h-[680px] flex-col overflow-hidden p-0 sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle className="px-6 pt-6">
              {editor?.template ? tt.editTitle : tt.createTitle}
              {editor && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {t.emailConfig.templateTypes[editor.templateType]}
                </span>
              )}
            </DialogTitle>
            <div className="mx-6 grid grid-cols-2 rounded-md bg-muted p-0.5 lg:hidden">
              <Button
                type="button"
                variant={mobilePanel === "editor" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setMobilePanel("editor")}
              >
                <Code2 className="size-3.5" />
                {tt.edit}
              </Button>
              <Button
                type="button"
                variant={mobilePanel === "preview" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setMobilePanel("preview")}
              >
                <Monitor className="size-3.5" />
                {tt.preview}
              </Button>
            </div>
          </DialogHeader>
          {editor && preview && (
            <div className="grid min-h-0 flex-1 border-y border-border lg:grid-cols-2">
              <div
                className={cn(
                  "min-h-0 flex-col gap-3 overflow-y-auto p-5",
                  mobilePanel === "editor" ? "flex" : "hidden",
                  "lg:flex"
                )}
              >
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
                <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">{tt.body}</Label>
                    <div className="flex items-center gap-1">
                      <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/30 p-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="size-7"
                              disabled={!bodyEditorApi}
                              onClick={() => {
                                void bodyEditorApi?.formatDocument();
                              }}
                              aria-label={tt.format}
                              aria-keyshortcuts="Alt+Shift+F"
                            >
                              <AlignLeft className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{tt.formatShortcut}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="size-7"
                              disabled={!bodyEditorApi}
                              onClick={() => bodyEditorApi?.minifyDocument()}
                              aria-label={tt.minify}
                              aria-keyshortcuts="Control+Shift+M Meta+Shift+M"
                            >
                              <Minimize2 className="size-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{tt.minifyShortcut}</TooltipContent>
                        </Tooltip>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="size-7"
                            onClick={resetToDefault}
                            aria-label={tt.resetDefault}
                          >
                            <RotateCcw className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{tt.resetDefault}</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <div className="rounded-md border border-border/60 bg-muted/35 px-2.5 py-2">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      {tt.quickVariables}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {TEMPLATE_VARIABLES.map((variable) => (
                        <button
                          type="button"
                          key={variable}
                          className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground ring-1 ring-inset ring-border transition-colors hover:text-foreground"
                          onClick={() => insertVariable(variable)}
                        >
                          {"{{"}
                          {variable}
                          {"}}"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="min-h-72 flex-1 overflow-hidden rounded-md border border-input bg-background shadow-xs">
                    {MonacoTemplateEditor ? (
                      <MonacoTemplateEditor
                        value={editor.body}
                        variables={TEMPLATE_VARIABLES}
                        ariaLabel={tt.body}
                        loadingLabel={tt.editorLoading}
                        minifyActionLabel={tt.minify}
                        onReady={setBodyEditorApi}
                        onChange={(body) =>
                          setEditor((current) =>
                            current ? { ...current, body } : current
                          )
                        }
                      />
                    ) : editorLoadFailed ? (
                      <div className="flex h-full min-h-72 flex-col items-center justify-center gap-2 text-center">
                        <p className="text-xs text-muted-foreground">
                          {tt.editorLoadFailed}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={ensureMonacoEditor}
                        >
                          {t.emailConfig.retry}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex h-full min-h-72 items-center justify-center bg-muted/30 text-xs text-muted-foreground">
                        {tt.editorLoading}
                      </div>
                    )}
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

              <div
                className={cn(
                  "min-h-0 min-w-0 flex-col bg-muted/30 lg:border-l lg:border-border",
                  mobilePanel === "preview" ? "flex" : "hidden",
                  "lg:flex"
                )}
              >
                <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <Code2 className="size-3.5 text-muted-foreground" />
                    {tt.preview}
                  </div>
                  <div className="flex rounded-md border border-border bg-background p-0.5">
                    <Button
                      type="button"
                      variant={previewMobile ? "ghost" : "secondary"}
                      size="icon"
                      className="size-7"
                      onClick={() => setPreviewMobile(false)}
                      aria-label={tt.desktopPreview}
                      title={tt.desktopPreview}
                    >
                      <Monitor className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant={previewMobile ? "secondary" : "ghost"}
                      size="icon"
                      className="size-7"
                      onClick={() => setPreviewMobile(true)}
                      aria-label={tt.mobilePreview}
                      title={tt.mobilePreview}
                    >
                      <Smartphone className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="border-b border-border/70 bg-background px-4 py-2.5">
                  <p className="truncate text-xs text-muted-foreground">
                    {tt.previewSubject}
                  </p>
                  <p className="truncate text-sm font-medium">{preview.subject}</p>
                </div>
                <div className="flex min-h-0 flex-1 justify-center overflow-auto p-3">
                  <iframe
                    title={tt.preview}
                    sandbox=""
                    srcDoc={preview.srcDoc}
                    className={cn(
                      "h-full min-h-[420px] rounded-md border border-border bg-white shadow-sm transition-[width]",
                      previewMobile ? "w-[375px] max-w-full" : "w-full"
                    )}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="shrink-0 px-6 pb-6">
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
