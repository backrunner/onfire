"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Flame, Loader2 } from "lucide-react";
import { signIn } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/admin/shell/theme-toggle";
import { LanguageToggle } from "@/components/admin/shell/language-toggle";

export default function AdminLoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [checkingInstall, setCheckingInstall] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function checkInstallStatus() {
      try {
        const res = await fetch("/api/tob/install");
        const data = (await res.json()) as {
          ok?: boolean;
          data?: { needsInstall?: boolean };
        };
        if (data.ok && data.data?.needsInstall) {
          router.push("/admin/install");
          return;
        }
      } catch (err) {
        console.error("Failed to check install status:", err);
      } finally {
        setCheckingInstall(false);
      }
    }
    checkInstallStatus();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await signIn.email({ email, password });
      if (result.error) {
        setError(t.login.loginFailed);
      } else {
        router.push("/admin");
      }
    } catch {
      setError(t.login.loginFailed);
    } finally {
      setLoading(false);
    }
  };

  if (checkingInstall) {
    return (
      <AuthShell>
        <Card className="w-full max-w-sm border-border/60 shadow-sm">
          <CardContent className="space-y-4 p-6">
            <Skeleton className="mx-auto h-10 w-10 rounded-lg" />
            <Skeleton className="mx-auto h-5 w-40" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="w-full max-w-sm space-y-6">
        {/* Brand */}
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Flame className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {t.login.title}
            </h1>
            <p className="text-sm text-muted-foreground">{t.login.subtitle}</p>
          </div>
        </div>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">{t.login.email}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder={t.login.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">{t.login.password}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder={t.login.passwordPlaceholder}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-md bg-red-500/10 px-3 py-2 text-center text-sm text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-400"
                >
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin" />}
                {t.common.login}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          {t.login.footer}
        </p>
      </div>
    </AuthShell>
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
