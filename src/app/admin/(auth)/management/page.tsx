"use client";

import { useI18n } from "@/lib/i18n";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TenantManagement } from "./_components/tenant-management";
import { ProductManagement } from "./_components/product-management";
import { TeamManagement } from "./_components/team-management";
import { TemplateManagement } from "./_components/template-management";
import { UserManagement } from "./_components/user-management";

export default function AdminManagementPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t.management.title}</h1>
        <p className="text-muted-foreground">{t.management.subtitle}</p>
      </div>

      <Tabs defaultValue="tenants">
        <TabsList className="flex-wrap">
          <TabsTrigger value="tenants">{t.management.tabs.tenants}</TabsTrigger>
          <TabsTrigger value="products">{t.management.tabs.products}</TabsTrigger>
          <TabsTrigger value="teams">{t.management.tabs.teams}</TabsTrigger>
          <TabsTrigger value="templates">
            {t.management.tabs.templates}
          </TabsTrigger>
          <TabsTrigger value="users">{t.management.tabs.users}</TabsTrigger>
        </TabsList>

        <TabsContent value="tenants" className="mt-6">
          <TenantManagement />
        </TabsContent>

        <TabsContent value="products" className="mt-6">
          <ProductManagement />
        </TabsContent>

        <TabsContent value="teams" className="mt-6">
          <TeamManagement />
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          <TemplateManagement />
        </TabsContent>

        <TabsContent value="users" className="mt-6">
          <UserManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
