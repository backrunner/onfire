"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";

interface Tenant {
  id: string;
  name: string;
  defaultTeamId?: string | null;
}

export function TenantManagement() {
  const { t } = useI18n();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [deletingTenant, setDeletingTenant] = useState<Tenant | null>(null);
  const [formData, setFormData] = useState({ name: "", defaultTeamId: "" });
  const [saving, setSaving] = useState(false);

  const fetchTenants = useCallback(async () => {
    try {
      const res = await fetch("/api/tob/admin/tenants");
      const data = (await res.json()) as { ok: boolean; data: Tenant[] };
      if (data.ok) {
        setTenants(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch tenants:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  const handleCreate = () => {
    setEditingTenant(null);
    setFormData({ name: "", defaultTeamId: "" });
    setDialogOpen(true);
  };

  const handleEdit = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setFormData({
      name: tenant.name,
      defaultTeamId: tenant.defaultTeamId || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = (tenant: Tenant) => {
    setDeletingTenant(tenant);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;

    setSaving(true);
    try {
      const url = editingTenant
        ? `/api/tob/admin/tenants/${editingTenant.id}`
        : "/api/tob/admin/tenants";
      const method = editingTenant ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          defaultTeamId: formData.defaultTeamId || null,
        }),
      });

      if (res.ok) {
        setDialogOpen(false);
        fetchTenants();
      }
    } catch (error) {
      console.error("Failed to save tenant:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingTenant) return;

    try {
      const res = await fetch(`/api/tob/admin/tenants/${deletingTenant.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setDeleteDialogOpen(false);
        setDeletingTenant(null);
        fetchTenants();
      }
    } catch (error) {
      console.error("Failed to delete tenant:", error);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.management.tabs.tenants}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t.management.tabs.tenants}</CardTitle>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            {t.management.tenants.create}
          </Button>
        </CardHeader>
        <CardContent>
          {tenants.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {t.management.noData.replace("{{type}}", t.management.tabs.tenants)}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>{t.management.tenants.namePlaceholder}</TableHead>
                  <TableHead>Default Team</TableHead>
                  <TableHead className="w-24">{t.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-mono text-xs">{tenant.id}</TableCell>
                    <TableCell>{tenant.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {tenant.defaultTeamId || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(tenant)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(tenant)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTenant ? t.management.tenants.edit : t.management.tenants.create}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t.management.tenants.namePlaceholder}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t.management.tenants.namePlaceholder}
              />
            </div>
            <div className="space-y-2">
              <Label>Default Team ID</Label>
              <Input
                value={formData.defaultTeamId}
                onChange={(e) =>
                  setFormData({ ...formData, defaultTeamId: e.target.value })
                }
                placeholder="team-xxx"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleSave} disabled={saving || !formData.name.trim()}>
              {saving ? t.common.loading : t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={deletingTenant?.name || ""}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
