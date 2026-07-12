"use client";

import { useState } from "react";
import { Package } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProductSelect, useProducts } from "@/components/admin/product-select";
import { EmailSettingsTab } from "@/components/admin/email/settings-tab";
import { EmailTemplatesTab } from "@/components/admin/email/templates-tab";
import { EmailLogsTab } from "@/components/admin/email/logs-tab";

export default function AdminEmailPage() {
  const { t } = useI18n();
  const { data: products, isLoading } = useProducts();
  const [productId, setProductId] = useState("");
  const [activeTab, setActiveTab] = useState("settings");
  const [settingsDirty, setSettingsDirty] = useState(false);

  const canDiscardSettings = () =>
    !settingsDirty || window.confirm(t.emailConfig.discardConfirm);

  const noProducts = !isLoading && (products?.length ?? 0) === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            {t.emailConfig.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t.emailConfig.subtitle}
          </p>
        </div>
        <ProductSelect
          value={productId}
          onChange={(nextProductId) => {
            if (nextProductId !== productId && !canDiscardSettings()) return;
            setSettingsDirty(false);
            setProductId(nextProductId);
          }}
          placeholder={t.emailConfig.selectProduct}
          emptyLabel={t.emailConfig.noProducts}
          autoSelectFirst
        />
      </div>

      {noProducts ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-1.5 py-12 text-center">
            <Package className="size-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">{t.emailConfig.noProducts}</p>
            <p className="text-xs text-muted-foreground">
              {t.emailConfig.noProductsHint}
            </p>
          </CardContent>
        </Card>
      ) : !productId ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (value !== "settings" && !canDiscardSettings()) return;
            setSettingsDirty(false);
            setActiveTab(value);
          }}
        >
          <TabsList>
            <TabsTrigger value="settings">
              {t.emailConfig.tabs.settings}
            </TabsTrigger>
            <TabsTrigger value="templates">
              {t.emailConfig.tabs.templates}
            </TabsTrigger>
            <TabsTrigger value="logs">
              {t.emailConfig.tabs.logs}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="settings" className="mt-4">
            <EmailSettingsTab
              productId={productId}
              onDirtyChange={setSettingsDirty}
            />
          </TabsContent>
          <TabsContent value="templates" className="mt-4">
            <EmailTemplatesTab productId={productId} />
          </TabsContent>
          <TabsContent value="logs" className="mt-4">
            <EmailLogsTab productId={productId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
