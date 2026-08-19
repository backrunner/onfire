"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Fingerprint,
  Flame,
  KeyRound,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { authClient, signIn } from "@/lib/auth";
import { safeSameOriginRedirect } from "@/lib/auth/redirect";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [twoFactorPending, setTwoFactorPending] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);

  const finishSignIn = (data: unknown) => {
    const returnedUrl =
      data &&
      typeof data === "object" &&
      "url" in data &&
      typeof data.url === "string"
        ? data.url
        : null;
    // Use a fresh document request so the protected server layout reads the
    // session cookie written by the sign-in response immediately.
    window.location.assign(
      safeSameOriginRedirect(returnedUrl, window.location.origin),
    );
  };

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
      } else if (
        result.data &&
        "twoFactorRedirect" in result.data &&
        result.data.twoFactorRedirect
      ) {
        setTwoFactorPending(true);
      } else {
        finishSignIn(result.data);
      }
    } catch {
      setError(t.login.loginFailed);
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeySignIn = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await authClient.signIn.passkey();
      if (result.error) {
        if (
          !("code" in result.error) ||
          result.error.code !== "AUTH_CANCELLED"
        ) {
          setError(t.login.passkeyFailed);
        }
        return;
      }
      finishSignIn(result.data);
    } catch {
      setError(t.login.passkeyFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleTwoFactor = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = useBackupCode
        ? await authClient.twoFactor.verifyBackupCode({
            code: otpCode,
            trustDevice,
          })
        : await authClient.twoFactor.verifyTotp({
            code: otpCode,
            trustDevice,
          });
      if (result.error) {
        setError(t.login.otpFailed);
        return;
      }
      finishSignIn(result.data);
    } catch {
      setError(t.login.otpFailed);
    } finally {
      setLoading(false);
    }
  };

  if (checkingInstall) {
    return (
      <AuthShell>
        <AuthLoadingSkeleton />
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
            <h1 className="text-lg font-semibold">{t.login.title}</h1>
            <p className="text-sm text-muted-foreground">
              {twoFactorPending ? t.login.otpSubtitle : t.login.subtitle}
            </p>
          </div>
        </div>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            {twoFactorPending ? (
              <form onSubmit={handleTwoFactor} className="space-y-4">
                <div className="flex justify-center">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
                    <ShieldCheck className="size-5 text-muted-foreground" />
                  </span>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="otp-code">
                    {useBackupCode ? t.login.backupCode : t.login.otpCode}
                  </Label>
                  <Input
                    id="otp-code"
                    inputMode={useBackupCode ? "text" : "numeric"}
                    autoComplete="one-time-code"
                    maxLength={useBackupCode ? 64 : 6}
                    value={otpCode}
                    onChange={(event) =>
                      setOtpCode(
                        useBackupCode
                          ? event.target.value
                          : event.target.value.replace(/\D/g, ""),
                      )
                    }
                    required
                    autoFocus
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={trustDevice}
                    onCheckedChange={(checked) =>
                      setTrustDevice(checked === true)
                    }
                  />
                  {t.login.trustDevice}
                </label>

                {error && <LoginError message={error} />}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="size-4 animate-spin" />}
                  {t.login.verifyOtp}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setUseBackupCode((current) => !current);
                    setOtpCode("");
                    setError("");
                  }}
                >
                  {useBackupCode
                    ? t.login.useAuthenticator
                    : t.login.useBackupCode}
                </Button>
              </form>
            ) : (
              <Tabs defaultValue="password" className="gap-4">
                <TabsList>
                  <TabsTrigger value="password">
                    <KeyRound />
                    {t.login.passwordTab}
                  </TabsTrigger>
                  <TabsTrigger value="passkey">
                    <Fingerprint />
                    {t.login.passkeyTab}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="password">
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="email">{t.login.email}</Label>
                      <Input
                        id="email"
                        type="email"
                        autoComplete="username webauthn"
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
                        autoComplete="current-password webauthn"
                        placeholder={t.login.passwordPlaceholder}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>

                    {error && <LoginError message={error} />}

                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading && <Loader2 className="size-4 animate-spin" />}
                      {t.common.login}
                    </Button>
                  </form>
                </TabsContent>
                <TabsContent value="passkey" className="space-y-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full"
                    onClick={() => void handlePasskeySignIn()}
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Fingerprint />
                    )}
                    {t.login.signInWithPasskey}
                  </Button>
                  {error && <LoginError message={error} />}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          {t.login.footer}
        </p>
      </div>
    </AuthShell>
  );
}

function AuthLoadingSkeleton() {
  return (
    <div className="w-full max-w-sm space-y-6" aria-hidden="true">
      <div className="flex flex-col items-center gap-2 text-center">
        <Skeleton className="size-11 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="mx-auto h-5 w-40" />
          <Skeleton className="mx-auto h-4 w-56 max-w-full" />
        </div>
      </div>
      <Card className="border-border/60 shadow-sm">
        <CardContent className="space-y-4 p-6">
          <Skeleton className="h-9 w-full" />
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="space-y-1.5">
                <div className="flex h-5 items-center">
                  <Skeleton
                    className={index === 0 ? "h-3.5 w-12" : "h-3.5 w-16"}
                  />
                </div>
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
            <Skeleton className="h-9 w-full" />
          </div>
        </CardContent>
      </Card>
      <Skeleton className="mx-auto h-3 w-48" />
    </div>
  );
}

function LoginError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-md bg-red-500/10 px-3 py-2 text-center text-sm text-red-700 ring-1 ring-inset ring-red-500/20 dark:text-red-400"
    >
      {message}
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
