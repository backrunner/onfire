"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import { toast } from "sonner";
import {
  Check,
  Fingerprint,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type PasskeyView = {
  id: string;
  name?: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: Date | string;
};

type TotpEnrollment = {
  uri: string;
  qrCode: string;
  backupCodes: string[];
};

export function SecuritySettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { data: session, refetch: refetchSession } = authClient.useSession();
  const twoFactorEnabled = Boolean(
    (session?.user as { twoFactorEnabled?: boolean } | undefined)
      ?.twoFactorEnabled,
  );
  const [passkeys, setPasskeys] = useState<PasskeyView[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [passkeyName, setPasskeyName] = useState("");
  const [editingPasskeyId, setEditingPasskeyId] = useState<string | null>(null);
  const [editingPasskeyName, setEditingPasskeyName] = useState("");
  const [deletingPasskeyId, setDeletingPasskeyId] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpPassword, setOtpPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const loadPasskeys = async () => {
    setPasskeysLoading(true);
    try {
      const result = await authClient.passkey.listUserPasskeys();
      if (result.error) throw new Error(result.error.message);
      setPasskeys((result.data ?? []) as PasskeyView[]);
    } catch {
      toast.error(t.account.passkeysLoadFailed);
    } finally {
      setPasskeysLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadPasskeys();
  }, [open]);

  const resetSecrets = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setOtpPassword("");
    setOtpCode("");
    setEnrollment(null);
    setBackupCodes([]);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetSecrets();
    onOpenChange(nextOpen);
  };

  const updatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error(t.account.passwordMismatch);
      return;
    }
    setBusy("password");
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (result.error) throw new Error(result.error.message);
      toast.success(t.account.passwordUpdated);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast.error(t.account.passwordUpdateFailed);
    } finally {
      setBusy(null);
    }
  };

  const addPasskey = async () => {
    setBusy("add-passkey");
    try {
      const result = await authClient.passkey.addPasskey({
        name: passkeyName.trim() || undefined,
      });
      if (result.error) {
        if (
          "code" in result.error &&
          result.error.code === "REGISTRATION_CANCELLED"
        ) {
          return;
        }
        throw new Error(result.error.message);
      }
      setPasskeyName("");
      await loadPasskeys();
      toast.success(t.account.passkeyAdded);
    } catch {
      toast.error(t.account.passkeyAddFailed);
    } finally {
      setBusy(null);
    }
  };

  const renamePasskey = async (id: string) => {
    if (!editingPasskeyName.trim()) return;
    setBusy(`rename-${id}`);
    try {
      const result = await authClient.passkey.updatePasskey({
        id,
        name: editingPasskeyName.trim(),
      });
      if (result.error) throw new Error(result.error.message);
      setEditingPasskeyId(null);
      await loadPasskeys();
      setDeletingPasskeyId(null);
      toast.success(t.account.passkeyUpdated);
    } catch {
      toast.error(t.account.passkeyUpdateFailed);
    } finally {
      setBusy(null);
    }
  };

  const deletePasskey = async (id: string) => {
    setBusy(`delete-${id}`);
    try {
      const result = await authClient.passkey.deletePasskey({ id });
      if (result.error) throw new Error(result.error.message);
      await loadPasskeys();
      toast.success(t.account.passkeyDeleted);
    } catch {
      toast.error(t.account.passkeyDeleteFailed);
    } finally {
      setBusy(null);
    }
  };

  const beginOtpEnrollment = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("enable-otp");
    try {
      const result = await authClient.twoFactor.enable({
        password: otpPassword,
      });
      if (
        result.error ||
        !result.data ||
        result.data.method !== "totp"
      ) {
        throw new Error(result.error?.message ?? "TOTP enrollment data missing");
      }
      const { totpURI, backupCodes } = result.data;
      const qrCode = await QRCode.toDataURL(totpURI, {
        margin: 1,
        width: 224,
        color: { dark: "#18181b", light: "#ffffff" },
      });
      setEnrollment({
        uri: totpURI,
        qrCode,
        backupCodes,
      });
      setBackupCodes(backupCodes);
    } catch {
      toast.error(t.account.otpEnableFailed);
    } finally {
      setBusy(null);
    }
  };

  const verifyOtpEnrollment = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("verify-otp");
    try {
      const result = await authClient.twoFactor.verifyTotp({ code: otpCode });
      if (result.error) throw new Error(result.error.message);
      await refetchSession();
      setEnrollment(null);
      setOtpCode("");
      setOtpPassword("");
      toast.success(t.account.otpEnabled);
    } catch {
      toast.error(t.account.otpInvalid);
    } finally {
      setBusy(null);
    }
  };

  const disableOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("disable-otp");
    try {
      const result = await authClient.twoFactor.disable({
        password: otpPassword,
      });
      if (result.error) throw new Error(result.error.message);
      await refetchSession();
      setOtpPassword("");
      setBackupCodes([]);
      toast.success(t.account.otpDisabled);
    } catch {
      toast.error(t.account.otpDisableFailed);
    } finally {
      setBusy(null);
    }
  };

  const regenerateBackupCodes = async () => {
    setBusy("backup-codes");
    try {
      const result = await authClient.twoFactor.generateBackupCodes({
        password: otpPassword,
      });
      if (result.error || !result.data) throw new Error(result.error?.message);
      setBackupCodes(result.data.backupCodes);
      toast.success(t.account.backupCodesRegenerated);
    } catch {
      toast.error(t.account.backupCodesFailed);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>{t.account.securityTitle}</DialogTitle>
          <DialogDescription>{t.account.securityDescription}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="password" className="min-h-0 gap-0">
          <TabsList variant="line" className="mx-5 mt-3 w-[calc(100%-2.5rem)]">
            <TabsTrigger value="password">
              <KeyRound />
              {t.account.passwordTab}
            </TabsTrigger>
            <TabsTrigger value="passkeys">
              <Fingerprint />
              {t.account.passkeysTab}
            </TabsTrigger>
            <TabsTrigger value="otp">
              <ShieldCheck />
              {t.account.otpTab}
            </TabsTrigger>
          </TabsList>
          <div className="max-h-[min(66vh,560px)] overflow-y-auto px-5 py-5">
            <TabsContent value="password">
              <form onSubmit={updatePassword} className="space-y-4">
                <PasswordField
                  id="security-current-password"
                  label={t.account.currentPassword}
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  autoComplete="current-password"
                />
                <PasswordField
                  id="security-new-password"
                  label={t.account.newPassword}
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                  minLength={8}
                />
                <PasswordField
                  id="security-confirm-password"
                  label={t.account.confirmPassword}
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                  minLength={8}
                />
                <div className="flex justify-end">
                  <Button type="submit" disabled={busy === "password"}>
                    {busy === "password" && (
                      <Loader2 className="animate-spin" />
                    )}
                    {t.account.updatePassword}
                  </Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="passkeys" className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={passkeyName}
                  onChange={(event) => setPasskeyName(event.target.value)}
                  placeholder={t.account.passkeyNamePlaceholder}
                  maxLength={100}
                />
                <Button
                  type="button"
                  className="self-end"
                  onClick={addPasskey}
                  disabled={busy === "add-passkey"}
                >
                  {busy === "add-passkey" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Plus />
                  )}
                  {t.account.addPasskey}
                </Button>
              </div>
              <div className="divide-y rounded-md border">
                {passkeysLoading ? (
                  <div className="flex min-h-20 items-center justify-center">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : passkeys.length === 0 ? (
                  <div className="flex min-h-20 items-center justify-center px-4 text-sm text-muted-foreground">
                    {t.account.noPasskeys}
                  </div>
                ) : (
                  passkeys.map((passkey) => (
                    <div
                      key={passkey.id}
                      className="flex min-h-14 items-center gap-3 px-3 py-2"
                    >
                      <Fingerprint className="size-4 shrink-0 text-muted-foreground" />
                      {editingPasskeyId === passkey.id ? (
                        <Input
                          className="h-8"
                          value={editingPasskeyName}
                          onChange={(event) =>
                            setEditingPasskeyName(event.target.value)
                          }
                          maxLength={100}
                          autoFocus
                        />
                      ) : (
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {passkey.name || t.account.unnamedPasskey}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {passkey.backedUp
                              ? t.account.syncedPasskey
                              : t.account.devicePasskey}
                          </p>
                        </div>
                      )}
                      {editingPasskeyId === passkey.id ? (
                        <>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={t.common.cancel}
                            onClick={() => setEditingPasskeyId(null)}
                          >
                            <X />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            aria-label={t.common.save}
                            onClick={() => void renamePasskey(passkey.id)}
                            disabled={busy === `rename-${passkey.id}`}
                          >
                            {busy === `rename-${passkey.id}` ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Check />
                            )}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={t.common.edit}
                            onClick={() => {
                              setEditingPasskeyId(passkey.id);
                              setEditingPasskeyName(passkey.name || "");
                            }}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            aria-label={t.common.delete}
                            onClick={() => setDeletingPasskeyId(passkey.id)}
                            disabled={busy === `delete-${passkey.id}`}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="otp" className="space-y-4">
              {enrollment ? (
                <form onSubmit={verifyOtpEnrollment} className="space-y-4">
                  <div className="mx-auto w-fit rounded-md border bg-white p-2">
                    <Image
                      src={enrollment.qrCode}
                      alt={t.account.otpQrAlt}
                      width={192}
                      height={192}
                      unoptimized
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="otp-enrollment-code">
                      {t.account.otpCode}
                    </Label>
                    <Input
                      id="otp-enrollment-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={otpCode}
                      onChange={(event) =>
                        setOtpCode(event.target.value.replace(/\D/g, ""))
                      }
                      required
                    />
                  </div>
                  <BackupCodes
                    codes={enrollment.backupCodes}
                    title={t.account.backupCodesTitle}
                  />
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={busy === "verify-otp" || otpCode.length !== 6}
                    >
                      {busy === "verify-otp" && (
                        <Loader2 className="animate-spin" />
                      )}
                      {t.account.verifyAndEnable}
                    </Button>
                  </div>
                </form>
              ) : twoFactorEnabled ? (
                <form onSubmit={disableOtp} className="space-y-4">
                  <div className="flex items-center gap-3 rounded-md border px-3 py-3">
                    <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <p className="text-sm font-medium">
                        {t.account.otpEnabledStatus}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.account.otpEnabledHint}
                      </p>
                    </div>
                  </div>
                  <PasswordField
                    id="otp-manage-password"
                    label={t.account.currentPassword}
                    value={otpPassword}
                    onChange={setOtpPassword}
                    autoComplete="current-password"
                  />
                  {backupCodes.length > 0 && (
                    <BackupCodes
                      codes={backupCodes}
                      title={t.account.backupCodesTitle}
                    />
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={regenerateBackupCodes}
                      disabled={!otpPassword || busy === "backup-codes"}
                    >
                      {busy === "backup-codes" && (
                        <Loader2 className="animate-spin" />
                      )}
                      {t.account.regenerateBackupCodes}
                    </Button>
                    <Button
                      type="submit"
                      variant="destructive"
                      disabled={!otpPassword || busy === "disable-otp"}
                    >
                      {busy === "disable-otp" && (
                        <Loader2 className="animate-spin" />
                      )}
                      {t.account.disableOtp}
                    </Button>
                  </div>
                </form>
              ) : (
                <form onSubmit={beginOtpEnrollment} className="space-y-4">
                  <div className="flex items-center gap-3 rounded-md border px-3 py-3">
                    <ShieldCheck className="size-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {t.account.otpDisabledStatus}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t.account.otpDisabledHint}
                      </p>
                    </div>
                  </div>
                  <PasswordField
                    id="otp-enable-password"
                    label={t.account.currentPassword}
                    value={otpPassword}
                    onChange={setOtpPassword}
                    autoComplete="current-password"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={!otpPassword || busy === "enable-otp"}
                    >
                      {busy === "enable-otp" && (
                        <Loader2 className="animate-spin" />
                      )}
                      {t.account.enableOtp}
                    </Button>
                  </div>
                </form>
              )}
            </TabsContent>
          </div>
        </Tabs>
        <AlertDialog
          open={Boolean(deletingPasskeyId)}
          onOpenChange={(nextOpen) => !nextOpen && setDeletingPasskeyId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t.account.deletePasskeyTitle}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t.account.deletePasskeyMessage}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() =>
                  deletingPasskeyId && void deletePasskey(deletingPasskeyId)
                }
              >
                {t.common.delete}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  minLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        autoComplete={autoComplete}
        minLength={minLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </div>
  );
}

function BackupCodes({ codes, title }: { codes: string[]; title: string }) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <p className="text-sm font-medium">{title}</p>
      <div className="grid grid-cols-2 gap-1 font-mono text-xs">
        {codes.map((code) => (
          <code
            key={code}
            className="rounded bg-background px-2 py-1.5 text-center ring-1 ring-border"
          >
            {code}
          </code>
        ))}
      </div>
    </div>
  );
}
