"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, X } from "lucide-react";

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
        const data = (await res.json()) as { ok: boolean; data: { needsInstall: boolean } };
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

  const isPasswordValid =
    passwordChecks.minLength &&
    passwordChecks.hasUppercase &&
    passwordChecks.hasLowercase &&
    passwordChecks.hasNumber &&
    passwordChecks.passwordsMatch;

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
    } catch (err) {
      setError(t.install.installFailed);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">{t.common.loading}</div>
      </div>
    );
  }

  if (!needsInstall) {
    return null;
  }

  const CheckItem = ({
    checked,
    label,
  }: {
    checked: boolean;
    label: string;
  }) => (
    <div className="flex items-center gap-2 text-sm">
      {checked ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <X className="h-4 w-4 text-muted-foreground" />
      )}
      <span className={checked ? "text-green-600" : "text-muted-foreground"}>
        {label}
      </span>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t.install.title}</CardTitle>
          <p className="text-muted-foreground">{t.install.subtitle}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Admin Account Section */}
            <div className="space-y-4">
              <h3 className="font-medium">{t.install.adminAccountSection}</h3>
              <div className="space-y-2">
                <Label htmlFor="email">{t.install.adminEmail}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t.install.adminEmailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
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
              <div className="space-y-2">
                <Label htmlFor="password">{t.install.password}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={t.install.passwordPlaceholder}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">
                  {t.install.confirmPassword}
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder={t.install.confirmPasswordPlaceholder}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <CheckItem
                  checked={passwordChecks.minLength}
                  label={t.install.passwordMinLength}
                />
                <CheckItem
                  checked={passwordChecks.hasUppercase}
                  label={t.install.passwordUppercase}
                />
                <CheckItem
                  checked={passwordChecks.hasLowercase}
                  label={t.install.passwordLowercase}
                />
                <CheckItem
                  checked={passwordChecks.hasNumber}
                  label={t.install.passwordNumber}
                />
                <CheckItem
                  checked={passwordChecks.passwordsMatch}
                  label={t.install.passwordMatch}
                />
              </div>
            </div>

            {/* Tenant Section */}
            <div className="space-y-4">
              <h3 className="font-medium">{t.install.tenantSection}</h3>
              <div className="space-y-2">
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
            </div>

            {error && (
              <div className="text-sm text-destructive text-center">{error}</div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !isPasswordValid || !tenantName}
            >
              {submitting ? t.common.loading : t.install.finishInstall}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
