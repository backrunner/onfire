"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useI18n } from "@/lib/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDiscardDialog } from "@/components/admin/confirm-discard-dialog";

// Inner tabs load lazily so opening the email panel only compiles and renders
// the active sub-tab (templates pulls in the Monaco chain).
const tabFallback = () => <Skeleton className="h-64 w-full" />;
const EmailSettingsTab = dynamic(
  () => import("./settings-tab").then((m) => m.EmailSettingsTab),
  { loading: tabFallback }
);
const EmailTemplatesTab = dynamic(
  () => import("./templates-tab").then((m) => m.EmailTemplatesTab),
  { loading: tabFallback }
);
const EmailLogsTab = dynamic(
  () => import("./logs-tab").then((m) => m.EmailLogsTab),
  { loading: tabFallback }
);

export function EmailProductPanel({
  productId,
  onDirtyChange,
}: {
  productId: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState("settings");
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);

  const applyTab = (value: string) => {
    setSettingsDirty(false);
    onDirtyChange?.(false);
    setActiveTab(value);
  };

  const requestTab = (value: string) => {
    if (value !== "settings" && settingsDirty) {
      setPendingTab(value);
      return;
    }
    applyTab(value);
  };

  return (
    <>
    <Tabs value={activeTab} onValueChange={requestTab}>
      <TabsList>
        <TabsTrigger value="settings">{t.emailConfig.tabs.settings}</TabsTrigger>
        <TabsTrigger value="templates">{t.emailConfig.tabs.templates}</TabsTrigger>
        <TabsTrigger value="logs">{t.emailConfig.tabs.logs}</TabsTrigger>
      </TabsList>
      <TabsContent value="settings" className="mt-4">
        <EmailSettingsTab
          productId={productId}
          onDirtyChange={(dirty) => {
            setSettingsDirty(dirty);
            onDirtyChange?.(dirty);
          }}
        />
      </TabsContent>
      <TabsContent value="templates" className="mt-4">
        <EmailTemplatesTab productId={productId} />
      </TabsContent>
      <TabsContent value="logs" className="mt-4">
        <EmailLogsTab productId={productId} />
      </TabsContent>
    </Tabs>
    <ConfirmDiscardDialog
      open={pendingTab !== null}
      onOpenChange={(open) => { if (!open) setPendingTab(null); }}
      onConfirm={() => {
        const target = pendingTab;
        setPendingTab(null);
        if (target) applyTab(target);
      }}
      description={t.emailConfig.discardConfirm}
    />
    </>
  );
}
