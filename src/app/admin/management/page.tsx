"use client";

import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminManagementPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t.management.title}</h1>
        <p className="text-muted-foreground">{t.management.subtitle}</p>
      </div>

      <Tabs defaultValue="tenants">
        <TabsList>
          <TabsTrigger value="tenants">{t.management.tabs.tenants}</TabsTrigger>
          <TabsTrigger value="products">{t.management.tabs.products}</TabsTrigger>
          <TabsTrigger value="teams">{t.management.tabs.teams}</TabsTrigger>
          <TabsTrigger value="templates">
            {t.management.tabs.templates}
          </TabsTrigger>
          <TabsTrigger value="users">{t.management.tabs.users}</TabsTrigger>
        </TabsList>

        <TabsContent value="tenants" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.management.tabs.tenants}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Tenant management coming soon...
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.management.tabs.products}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Product management coming soon...
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="teams" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.management.tabs.teams}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Team management coming soon...
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.management.tabs.templates}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Template management coming soon...
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.management.tabs.users}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                User management coming soon...
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
