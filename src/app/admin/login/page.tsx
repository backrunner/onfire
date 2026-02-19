"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
        const data = (await res.json()) as { ok?: boolean; data?: { needsInstall?: boolean } };
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
      const result = await signIn.email({
        email,
        password,
      });

      if (result.error) {
        setError(t.login.loginFailed);
      } else {
        router.push("/admin");
      }
    } catch (err) {
      setError(t.login.loginFailed);
    } finally {
      setLoading(false);
    }
  };

  if (checkingInstall) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">{t.common.loading}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t.login.title}</CardTitle>
          <p className="text-muted-foreground">{t.login.subtitle}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t.login.email}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t.login.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t.login.password}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t.login.passwordPlaceholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <div className="text-sm text-destructive text-center">{error}</div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t.common.loading : t.common.login}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            {t.login.footer}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
