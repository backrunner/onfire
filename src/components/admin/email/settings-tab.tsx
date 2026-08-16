"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  AlertTriangle,
  Copy,
  Inbox,
  KeyRound,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api, swrFetcher, qs } from "@/lib/api/client";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type {
  AiFilterStrictness,
  EmailConfigView,
  InboundProvider,
  OutboundProvider,
} from "./types";
import { showEmailMutationFailure } from "./toast";

const INBOUND_PROVIDERS: InboundProvider[] = [
  "cloudflare",
  "maileroo",
  "generic",
];
const OUTBOUND_PROVIDERS: OutboundProvider[] = [
  "cloudflare",
  "resend",
  "sendgrid",
  "mailgun",
  "maileroo",
  "smtp",
];
const PROVIDER_LABELS: Record<string, string> = {
  maileroo: "Maileroo",
  sendgrid: "SendGrid",
  mailgun: "Mailgun",
  resend: "Resend",
  smtp: "SMTP",
  cloudflare: "Cloudflare Email Routing",
};
const OUTBOUND_LABELS: Record<string, string> = {
  ...PROVIDER_LABELS,
  cloudflare: "Cloudflare Email",
};

function isOutboundProvider(value: unknown): value is OutboundProvider {
  return (
    typeof value === "string" &&
    (OUTBOUND_PROVIDERS as readonly string[]).includes(value)
  );
}

interface FormState {
  inboundEnabled: boolean;
  inboundProvider: InboundProvider;
  inboundAddress: string;
  outboundEnabled: boolean;
  outboundProvider: OutboundProvider;
  outboundApiKey: string;
  outboundSmtpHost: string;
  outboundSmtpPort: string;
  outboundSmtpUser: string;
  outboundSmtpPass: string;
  outboundSenderName: string;
  outboundSenderEmail: string;
  outboundReplyTo: string;
  aiFilterEnabled: boolean;
  aiFilterStrictness: AiFilterStrictness;
}

function toFormState(config: EmailConfigView | null): FormState {
  return {
    inboundEnabled: config?.inboundEnabled ?? false,
    inboundProvider: config?.inboundProvider ?? "generic",
    inboundAddress: config?.inboundAddress ?? "",
    outboundEnabled: config?.outboundEnabled ?? false,
    outboundProvider: isOutboundProvider(config?.outboundProvider)
      ? config.outboundProvider
      : "resend",
    outboundApiKey: "",
    outboundSmtpHost: config?.outboundSmtpHost ?? "",
    outboundSmtpPort: config?.outboundSmtpPort
      ? String(config.outboundSmtpPort)
      : "",
    outboundSmtpUser: config?.outboundSmtpUser ?? "",
    outboundSmtpPass: "",
    outboundSenderName: config?.outboundSenderName ?? "",
    outboundSenderEmail: config?.outboundSenderEmail ?? "",
    outboundReplyTo: config?.outboundReplyTo ?? "",
    aiFilterEnabled: config?.aiFilterEnabled ?? false,
    aiFilterStrictness: config?.aiFilterStrictness ?? "medium",
  };
}

export function EmailSettingsTab({
  productId,
  onDirtyChange,
}: {
  productId: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const tc = t.emailConfig;

  const { data, error, isLoading, mutate } = useSWR<EmailConfigView | null>(
    `/api/tob/admin/email-config${qs({ productId })}`,
    swrFetcher
  );
  const config = data ?? null;
  const persistedForm = toFormState(config);
  const persistedSnapshot = JSON.stringify(persistedForm);

  const [form, setForm] = useState<FormState>(() => persistedForm);
  const [saving, setSaving] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const syncedSnapshotRef = useRef({ productId, snapshot: persistedSnapshot });
  const isDirty =
    syncedSnapshotRef.current.productId === productId &&
    syncedSnapshotRef.current.snapshot === persistedSnapshot &&
    JSON.stringify(form) !== persistedSnapshot;

  useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  useEffect(() => {
    setForm(persistedForm);
    syncedSnapshotRef.current = { productId, snapshot: persistedSnapshot };
    // Re-sync the form whenever the product or stored config changes.
  }, [productId, persistedSnapshot]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        productId,
        inboundEnabled: form.inboundEnabled,
        inboundProvider: form.inboundProvider,
        inboundAddress: form.inboundAddress.trim() || null,
        outboundEnabled: form.outboundEnabled,
        outboundProvider: form.outboundProvider,
        outboundSmtpHost: form.outboundSmtpHost.trim() || null,
        outboundSmtpPort: form.outboundSmtpPort.trim()
          ? Number(form.outboundSmtpPort.trim())
          : null,
        outboundSmtpUser: form.outboundSmtpUser.trim() || null,
        outboundSenderName: form.outboundSenderName.trim() || null,
        outboundSenderEmail: form.outboundSenderEmail.trim() || null,
        outboundReplyTo: form.outboundReplyTo.trim() || null,
        aiFilterEnabled: form.aiFilterEnabled,
        aiFilterStrictness: form.aiFilterStrictness,
      };
      // Secrets are only written when explicitly provided.
      if (form.outboundApiKey.trim()) {
        payload.outboundApiKey = form.outboundApiKey.trim();
      }
      if (form.outboundSmtpPass.trim()) {
        payload.outboundSmtpPass = form.outboundSmtpPass.trim();
      }
      await api.post("/api/tob/admin/email-config", payload);
      toast.success(tc.saved);
      setForm((current) => ({
        ...current,
        outboundApiKey: "",
        outboundSmtpPass: "",
      }));
      await mutate();
    } catch (err) {
      showEmailMutationFailure(err, tc.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => setForm(persistedForm);

  const handleGenerateSecret = async () => {
    setGenerating(true);
    try {
      const result = await api.post<{ webhookSecret: string }>(
        `/api/tob/admin/email-config/${productId}/webhook-secret`
      );
      setNewSecret(result.webhookSecret);
      await mutate();
    } catch (err) {
      showEmailMutationFailure(err, tc.inbound.regenerateFailed);
    } finally {
      setGenerating(false);
    }
  };

  const handleTestSend = async () => {
    if (!testTo.trim()) {
      toast.warning(tc.outbound.testRecipientRequired);
      return;
    }
    setTesting(true);
    try {
      await api.post(`/api/tob/admin/email-config/${productId}/test`, {
        to: testTo.trim(),
      });
      toast.success(tc.outbound.testSent);
      setTestOpen(false);
      setTestTo("");
    } catch (err) {
      showEmailMutationFailure(err, tc.outbound.testFailed);
    } finally {
      setTesting(false);
    }
  };

  const copySecret = async () => {
    if (!newSecret) return;
    await navigator.clipboard.writeText(newSecret);
    toast.success(tc.inbound.copied);
  };

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="size-8 text-red-600 dark:text-red-400" />
          <p className="text-sm text-muted-foreground">{tc.loadFailed}</p>
          <Button size="sm" variant="outline" onClick={() => mutate()}>
            {tc.retry}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}
    >
      {/* Inbound */}
      <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 px-5 py-4">
          <div className="flex min-w-0 gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400">
              <Inbox className="size-4" />
            </span>
            <div>
              <CardTitle className="text-base">{tc.inbound.title}</CardTitle>
              <CardDescription className="mt-1 text-xs">
                {tc.inbound.description}
              </CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Label
              htmlFor="inbound-enabled"
              className="whitespace-nowrap text-xs text-muted-foreground"
            >
              {tc.inbound.enabled}
            </Label>
            <Switch
              id="inbound-enabled"
              checked={form.inboundEnabled}
              onCheckedChange={(v) => set("inboundEnabled", v)}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-5 pb-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{tc.inbound.provider}</Label>
              <Select
                value={form.inboundProvider}
                onValueChange={(v) =>
                  set("inboundProvider", v as InboundProvider)
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INBOUND_PROVIDERS.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {provider === "generic"
                        ? tc.inbound.providerGeneric
                        : PROVIDER_LABELS[provider]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tc.inbound.address}</Label>
              <Input
                type="email"
                autoComplete="email"
                value={form.inboundAddress}
                onChange={(e) => set("inboundAddress", e.target.value)}
                placeholder={tc.inbound.addressPlaceholder}
                className="h-8 text-sm"
              />
            </div>
          </div>

          {form.inboundProvider === "cloudflare" ? (
            <div className="flex gap-3 rounded-lg border border-sky-500/20 bg-sky-500/[0.06] px-3 py-2.5 text-sky-800 dark:text-sky-300">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <p className="text-xs leading-5">{tc.inbound.cloudflareHint}</p>
            </div>
          ) : (
            <>
              <Separator />
              <div className="flex flex-wrap items-center gap-3">
                <KeyRound className="size-4 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{tc.inbound.webhookSecret}</p>
                  <p className="text-xs text-muted-foreground">
                    {config
                      ? config.hasWebhookSecret
                        ? tc.inbound.secretConfigured
                        : tc.inbound.secretNotConfigured
                      : tc.inbound.saveFirst}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={!config || generating}
                  onClick={handleGenerateSecret}
                >
                  {config?.hasWebhookSecret
                    ? tc.inbound.regenerate
                    : tc.inbound.generate}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Outbound */}
      <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 px-5 py-4">
          <div className="flex min-w-0 gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
              <Send className="size-4" />
            </span>
            <div>
              <CardTitle className="text-base">{tc.outbound.title}</CardTitle>
              <CardDescription className="mt-1 text-xs">
                {tc.outbound.description}
              </CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Label
              htmlFor="outbound-enabled"
              className="whitespace-nowrap text-xs text-muted-foreground"
            >
              {tc.outbound.enabled}
            </Label>
            <Switch
              id="outbound-enabled"
              checked={form.outboundEnabled}
              onCheckedChange={(v) => set("outboundEnabled", v)}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-5 pb-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{tc.outbound.provider}</Label>
              <Select
                value={form.outboundProvider}
                onValueChange={(v) =>
                  set("outboundProvider", v as OutboundProvider)
                }
              >
                <SelectTrigger className="h-8 w-full text-sm">
                  <SelectValue placeholder={tc.outbound.providerPlaceholder}>
                    {OUTBOUND_LABELS[form.outboundProvider]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {OUTBOUND_PROVIDERS.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {OUTBOUND_LABELS[provider]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.outboundProvider !== "smtp" &&
              form.outboundProvider !== "cloudflare" && (
              <div className="space-y-1.5">
                <Label className="text-xs">{tc.outbound.apiKey}</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  value={form.outboundApiKey}
                  onChange={(e) => set("outboundApiKey", e.target.value)}
                  placeholder={
                    config?.hasOutboundApiKey
                      ? tc.outbound.apiKeyConfigured
                      : tc.outbound.apiKeyPlaceholder
                  }
                  className="h-8 text-sm"
                />
              </div>
            )}
          </div>

          {form.outboundProvider === "cloudflare" && (
            <p className="text-xs text-muted-foreground">
              {tc.outbound.cloudflareHint}
            </p>
          )}

          {form.outboundProvider === "smtp" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{tc.outbound.smtpHost}</Label>
                <Input
                  autoComplete="url"
                  value={form.outboundSmtpHost}
                  onChange={(e) => set("outboundSmtpHost", e.target.value)}
                  placeholder={tc.outbound.smtpHostPlaceholder}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tc.outbound.smtpPort}</Label>
                <Input
                  type="number"
                  value={form.outboundSmtpPort}
                  onChange={(e) => set("outboundSmtpPort", e.target.value)}
                  placeholder="587"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tc.outbound.smtpUser}</Label>
                <Input
                  autoComplete="username"
                  value={form.outboundSmtpUser}
                  onChange={(e) => set("outboundSmtpUser", e.target.value)}
                  placeholder={tc.outbound.smtpUserPlaceholder}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tc.outbound.smtpPass}</Label>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={form.outboundSmtpPass}
                  onChange={(e) => set("outboundSmtpPass", e.target.value)}
                  placeholder={
                    config?.hasOutboundSmtpPass
                      ? tc.outbound.smtpPassConfigured
                      : tc.outbound.smtpPassPlaceholder
                  }
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{tc.outbound.senderName}</Label>
              <Input
                autoComplete="name"
                value={form.outboundSenderName}
                onChange={(e) => set("outboundSenderName", e.target.value)}
                placeholder={tc.outbound.senderNamePlaceholder}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tc.outbound.senderEmail}</Label>
              <Input
                type="email"
                autoComplete="email"
                value={form.outboundSenderEmail}
                onChange={(e) => set("outboundSenderEmail", e.target.value)}
                placeholder={tc.outbound.senderEmailPlaceholder}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tc.outbound.replyTo}</Label>
              <Input
                type="email"
                autoComplete="email"
                value={form.outboundReplyTo}
                onChange={(e) => set("outboundReplyTo", e.target.value)}
                placeholder={tc.outbound.replyToPlaceholder}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!config?.outboundEnabled || isDirty}
              title={
                !config?.outboundEnabled || isDirty
                  ? tc.outbound.testSaveFirst
                  : undefined
              }
              onClick={() => setTestOpen(true)}
            >
              <Send className="mr-1.5 size-3.5" />
              {tc.outbound.testSend}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* AI filter */}
      <Card className="gap-0 overflow-hidden border-border/70 py-0 shadow-[0_1px_2px_0_rgb(0_0_0/0.03)]">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 px-5 py-4">
          <div className="flex min-w-0 gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400">
              <ShieldCheck className="size-4" />
            </span>
            <div>
              <CardTitle className="text-base">{tc.aiFilter.title}</CardTitle>
              <CardDescription className="mt-1 text-xs">
                {tc.aiFilter.description}
              </CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Label
              htmlFor="ai-filter-enabled"
              className="whitespace-nowrap text-xs text-muted-foreground"
            >
              {tc.aiFilter.enabled}
            </Label>
            <Switch
              id="ai-filter-enabled"
              checked={form.aiFilterEnabled}
              disabled={!form.aiFilterEnabled && !config?.aiFilterAvailable}
              onCheckedChange={(v) => {
                if (v && !config?.aiFilterAvailable) return;
                set("aiFilterEnabled", v);
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4 space-y-3">
          {!config?.aiFilterAvailable && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {tc.aiFilter.requiresCredential}
            </p>
          )}
          <div className="max-w-xs space-y-1.5">
            <Label className="text-xs">{tc.aiFilter.strictness}</Label>
            <Select
              value={form.aiFilterStrictness}
              onValueChange={(v) =>
                set("aiFilterStrictness", v as AiFilterStrictness)
              }
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">{tc.aiFilter.low}</SelectItem>
                <SelectItem value="medium">{tc.aiFilter.medium}</SelectItem>
                <SelectItem value="high">{tc.aiFilter.high}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-3 z-20 flex items-center justify-between gap-3 rounded-lg border border-border/80 bg-background/90 px-3 py-2 shadow-[0_8px_30px_rgb(0_0_0/0.08)] backdrop-blur-xl">
        <p className="text-xs text-muted-foreground">
          {isDirty ? tc.unsaved : tc.upToDate}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={resetForm}
            disabled={!isDirty || saving}
          >
            <RotateCcw className="size-3.5" />
            {tc.reset}
          </Button>
          <Button type="submit" size="sm" disabled={!isDirty || saving}>
            <Save className="size-3.5" />
            {tc.save}
          </Button>
        </div>
      </div>

      {/* New webhook secret dialog */}
      <Dialog
        open={newSecret !== null}
        onOpenChange={(open) => !open && setNewSecret(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tc.inbound.secretDialogTitle}</DialogTitle>
            <DialogDescription className="text-amber-600 dark:text-amber-400">
              {tc.inbound.secretDialogWarning}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">
              {newSecret}
            </code>
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0"
              onClick={copySecret}
            >
              <Copy className="mr-1.5 size-3.5" />
              {tc.inbound.copySecret}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Test send dialog */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{tc.outbound.testDialogTitle}</DialogTitle>
            <DialogDescription>{tc.outbound.testDialogDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">{tc.outbound.testRecipient}</Label>
            <Input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder={tc.outbound.testRecipientPlaceholder}
              className="h-8 text-sm"
            />
          </div>
          <DialogFooter>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTestOpen(false)}
            >
              {t.common.cancel}
            </Button>
            <Button
              size="sm"
              onClick={handleTestSend}
              disabled={testing || !testTo.trim()}
            >
              {tc.outbound.testSend}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
