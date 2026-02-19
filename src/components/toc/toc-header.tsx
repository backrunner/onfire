"use client";

import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { User, LogOut } from "lucide-react";

interface TocHeaderProps {
  productName?: string;
  customerEmail?: string;
  onLogout?: () => void;
}

export function TocHeader({ productName, customerEmail, onLogout }: TocHeaderProps) {
  const { t } = useI18n();

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">OnFire Support</h1>
          {productName && (
            <Badge variant="outline" className="hidden sm:inline-flex">
              {productName}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {customerEmail && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">{customerEmail}</span>
            </div>
          )}
          {onLogout && (
            <Button variant="ghost" size="icon" onClick={onLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
