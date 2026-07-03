"use client";

import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  /** May be async; throwing keeps the dialog open so the user can retry. */
  onConfirm: () => void | Promise<void>;
  requireNameConfirmation?: boolean;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  itemName,
  onConfirm,
  requireNameConfirmation = false,
}: DeleteConfirmDialogProps) {
  const { t } = useI18n();
  const [confirmInput, setConfirmInput] = useState("");
  const [pending, setPending] = useState(false);

  const canConfirm =
    !pending && (!requireNameConfirmation || confirmInput === itemName);

  const handleOpenChange = (next: boolean) => {
    if (pending) return;
    if (!next) setConfirmInput("");
    onOpenChange(next);
  };

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!canConfirm) return;
    setPending(true);
    try {
      await onConfirm();
      setConfirmInput("");
      onOpenChange(false);
    } catch {
      // Caller surfaces the error (toast); keep the dialog open.
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.management.deleteConfirm.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {t.management.deleteConfirm.message.replace("{{name}}", itemName)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {requireNameConfirmation && (
          <div className="py-2">
            <p className="mb-2 text-sm text-muted-foreground">
              {t.management.deleteConfirm.inputHint}
            </p>
            <Input
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={itemName}
              className="h-8"
              disabled={pending}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t.common.cancel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="bg-red-600 text-white hover:bg-red-600/90 dark:bg-red-500 dark:hover:bg-red-500/90"
          >
            {pending ? t.common.loading : t.common.delete}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
