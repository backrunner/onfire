"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Glasses } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
import { usePreviewIdentity } from "@/lib/hooks/use-preview-identity";
import { canManageRole } from "@/lib/api-utils";
import { swrFetcher } from "@/lib/api/client";
import { Role } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PreviewUserRow {
  id: string;
  email: string;
  displayName: string;
  tenantId: string;
  role: Role;
}

export function PreviewIdentityDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { me } = useMe();
  const { start } = usePreviewIdentity();
  const { data: users } = useSWR<PreviewUserRow[]>(
    open ? "/api/tob/admin/users" : null,
    swrFetcher
  );
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const candidates = useMemo(() => {
    if (!me) return [];
    const q = search.trim().toLowerCase();
    return (users ?? []).filter((user) => {
      if (!canManageRole(me.role, user.role)) return false;
      if (!q) return true;
      return (
        user.displayName.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q)
      );
    });
  }, [me, search, users]);

  const handleStart = async () => {
    if (!selectedId) return;
    setPending(true);
    try {
      await start(selectedId);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.preview.startFailed);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) {
          setSearch("");
          setSelectedId(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.preview.start}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t.preview.hint}</p>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t.preview.searchUser}
          className="h-8"
        />
        <ScrollArea className="h-56 rounded-md border">
          {candidates.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t.preview.noUsers}
            </p>
          ) : (
            <div className="p-1">
              {candidates.map((user) => {
                const selected = selectedId === user.id;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => setSelectedId(user.id)}
                    className={
                      selected
                        ? "flex w-full items-start gap-2 rounded-sm bg-accent px-2 py-2 text-left"
                        : "flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left hover:bg-accent/60"
                    }
                  >
                    <Glasses className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {user.displayName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {user.email}
                      </span>
                    </span>
                    <Badge variant="outline" className="shrink-0 text-[11px]">
                      {t.roles[user.role] ?? user.role}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t.common.cancel}
          </Button>
          <Button
            size="sm"
            className="h-8"
            onClick={() => void handleStart()}
            disabled={pending || !selectedId}
          >
            {pending ? t.common.loading : t.preview.start}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
