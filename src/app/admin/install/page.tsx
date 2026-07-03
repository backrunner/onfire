"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Flame, Loader2, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/admin/shell/theme-toggle";
import { LanguageToggle } from "@/components/admin/shell/language-toggle";

export default function AdminInstallPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [needsInstall, setNeedsInstall] = useState(false);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [tenantName, setTenantName] = useState("");

  useEffect(() => {
    async function checkInstallStatus() {
      try {
        const res = await fetch("/api/tob/install");
        const data = (await res.json()) as {
          ok: boolean;
          data: { needsInstall: boolean };
        };
        if (data.ok && data.data.needsInstall) {
          setNeedsInstall(true);
        } else {
          router.push("/admin/login");
        }
      } catch (err) {
        console.error("Failed to check install status:", err);
      } finally {
        setLoading(false);
      }
    }
    checkInstallStatus();
  }, [router]);

  const passwordChecks = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    passwordsMatch: password === confirmPassword && password.length > 0,
  };

  const isPasswordValid = Object.values(passwordChecks).every(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid || !tenantName) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/tob/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          displayName: displayName || email.split("@")[0],
          tenantName,
        }),
      });

      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        router.push("/admin/login");
      } else {
        setError(data.error || t.install.installFailed);
      }
    } catch {
      setError(t.install.installFailed);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AuthShell>
        <Card className="w-full max-w-lg border-border/60 shadow-sm">
          <CardContent className="space-y-4 p-6">
            <Skeleton className="mx-auto h-10 w-10 rounded-lg" />
            <Skeleton className="mx-auto h-5 w-48" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  if (!needsInstall) return null;

  return (
    <AuthShell>
      <div className="w-full max-w-lg space-y-6 py-8">
        {/* Brand */}
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Flame className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {t.install.title}
            </h1>
            <p className="text-sm text-muted-foreground">{t.install.subtitle}</p>
          </div>
        </div>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Admin account */}
              <section className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t.install.adminAccountSection}
                </h3>
                <div className="space-y-1.5">
                  <Label htmlFor="email">{t.install.adminEmail}</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder={t.install.adminEmailPlaceholder}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="displayName">{t.install.displayName}</Label>
                  <Input
                    id="displayName"
                    placeholder={t.install.displayNamePlaceholder}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t.install.displayNameHint}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="password">{t.install.password}</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      placeholder={t.install.passwordPlaceholder}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword">
                      {t.install.confirmPassword}
                    </Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      placeholder={t.install.confirmPasswordPlaceholder}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-1 rounded-md border border-border/60 bg-muted/30 p-3 sm:grid-cols-2">
                  <CheckItem checked={passwordChecks.minLength} label={t.install.passwordMinLength} />
                  <CheckItem checked={passwordChecks.hasUppercase} label={t.install.passwordUppercase} />
                  <CheckItem checked={passwordChecks.hasLowercase} label={t.install.passwordLowercase} />
                  <CheckItem checked={passwordChecks.hasNumber} label={t.install.passwordNumber} />
                  <CheckItem checked={passwordChecks.passwordsMatch} label={t.install.passwordMatch} />
                </div>
              </section>

              <Separator />

              {/* Tenant */}
              <section className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t.install.tenantSection}
                </h3>
                <div className="space-y-1.5">
                  <Label htmlFor="tenantName">{t.install.tenantName}</Label>
                  <Input
                    id="tenantName"
                    placeholder={t.install.tenantNamePlaceholder}
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    {t.install.tenantNameHint}
                  </p>
                </div>
              </section>

              {error && (
                <div
                  role="alert"
                  className="rounded-md bg-red-500/10 px-3 py-2 text-center text-sm text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-400"
                >
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={submitting || !isPasswordValid || !tenantName}
              >
                {submitting && <Loader2 className="size-4 animate-spin" />}
                {t.install.finishInstall}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AuthShell>
  );
}

function CheckItem({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {checked ? (
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <X className="size-3.5 text-muted-foreground/60" />
      )}
      <span
        className={cn(
          checked
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-muted-foreground"
        )}
      >
        {label}
      </span>
    </div>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <div className="absolute right-4 top-4 flex items-center gap-1">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}
