"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmailSettingsTab } from "./settings-tab";
import { EmailTemplatesTab } from "./templates-tab";
import { EmailLogsTab } from "./logs-tab";

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

  const canDiscardSettings = () =>
    !settingsDirty || window.confirm(t.emailConfig.discardConfirm);

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        if (value !== "settings" && !canDiscardSettings()) return;
        setSettingsDirty(false);
        onDirtyChange?.(false);
        setActiveTab(value);
      }}
    >
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
  );
}
