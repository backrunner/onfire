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

  const noProducts = !isLoading && (products?.length ?? 0) === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t.emailConfig.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t.emailConfig.subtitle}
          </p>
        </div>
        <ProductSelect
          value={productId}
          onChange={setProductId}
          placeholder={t.emailConfig.selectProduct}
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
        <Tabs defaultValue="settings">
          <TabsList className="h-8">
            <TabsTrigger value="settings" className="text-xs">
              {t.emailConfig.tabs.settings}
            </TabsTrigger>
            <TabsTrigger value="templates" className="text-xs">
              {t.emailConfig.tabs.templates}
            </TabsTrigger>
            <TabsTrigger value="logs" className="text-xs">
              {t.emailConfig.tabs.logs}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="settings" className="mt-4">
            <EmailSettingsTab productId={productId} />
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
