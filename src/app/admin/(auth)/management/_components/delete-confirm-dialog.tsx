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
  onConfirm: () => void;
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

  const canConfirm = !requireNameConfirmation || confirmInput === itemName;

  const handleConfirm = () => {
    if (canConfirm) {
      onConfirm();
      setConfirmInput("");
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.management.deleteConfirm.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {t.management.deleteConfirm.message.replace("{{name}}", itemName)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {requireNameConfirmation && (
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-2">
              {t.management.deleteConfirm.inputHint}
            </p>
            <Input
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={itemName}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmInput("")}>
            {t.common.cancel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t.common.delete}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
