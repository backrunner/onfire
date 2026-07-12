"use client";

import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminAccountPage() {
  const { t } = useI18n();
  const { me, isLoading } = useMe();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const initials = (me?.user.displayName || me?.user.email || "?")
    .slice(0, 2)
    .toUpperCase();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error(t.account.passwordMismatch);
      return;
    }

    setLoading(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (error) {
        toast.error(error.message || t.account.passwordUpdateFailed);
      } else {
        toast.success(t.account.passwordUpdated);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      toast.error(t.account.passwordUpdateFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          {t.account.title}
        </h1>
        <p className="text-sm text-muted-foreground">{t.account.subtitle}</p>
      </div>

      {/* Profile summary */}
      <Card>
        <CardContent className="flex items-center gap-4">
          {isLoading ? (
            <>
              <Skeleton className="size-12 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
            </>
          ) : (
            <>
              <Avatar className="size-12">
                <AvatarFallback className="text-sm">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">
                    {me?.user.displayName}
                  </p>
                  {me?.role && (
                    <Badge variant="secondary" className="text-[11px]">
                      {t.roles[me.role] ?? me.role}
                    </Badge>
                  )}
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {me?.user.email}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-muted-foreground" />
            {t.account.updatePassword}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">
                {t.account.currentPassword}
              </Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">{t.account.newPassword}</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">
                {t.account.confirmPassword}
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" size="sm" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {t.account.updatePassword}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
