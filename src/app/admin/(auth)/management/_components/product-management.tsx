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

interface Product {
  id: string;
  tenantId: string;
  name: string;
  slaHighAccept?: number | null;
  slaHighReply?: number | null;
  slaMediumAccept?: number | null;
  slaMediumReply?: number | null;
  slaLowAccept?: number | null;
  slaLowReply?: number | null;
  teamIds?: string[];
}

export function ProductManagement() {
  const { t } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    slaHighAccept: "",
    slaHighReply: "",
    slaMediumAccept: "",
    slaMediumReply: "",
    slaLowAccept: "",
    slaLowReply: "",
    teamIds: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/tob/admin/products");
      const data = (await res.json()) as { ok: boolean; data: Product[] };
      if (data.ok) {
        setProducts(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch products:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleCreate = () => {
    setEditingProduct(null);
    setFormData({
      name: "",
      slaHighAccept: "",
      slaHighReply: "",
      slaMediumAccept: "",
      slaMediumReply: "",
      slaLowAccept: "",
      slaLowReply: "",
      teamIds: "",
    });
    setDialogOpen(true);
  };

  const handleEdit = async (product: Product) => {
    // Fetch full product details including teamIds
    try {
      const res = await fetch(`/api/tob/admin/products/${product.id}`);
      const data = (await res.json()) as { ok: boolean; data: Product };
      if (data.ok) {
        const p = data.data;
        setEditingProduct(p);
        setFormData({
          name: p.name,
          slaHighAccept: p.slaHighAccept?.toString() || "",
          slaHighReply: p.slaHighReply?.toString() || "",
          slaMediumAccept: p.slaMediumAccept?.toString() || "",
          slaMediumReply: p.slaMediumReply?.toString() || "",
          slaLowAccept: p.slaLowAccept?.toString() || "",
          slaLowReply: p.slaLowReply?.toString() || "",
          teamIds: p.teamIds?.join(",") || "",
        });
        setDialogOpen(true);
      }
    } catch (error) {
      console.error("Failed to fetch product:", error);
    }
  };

  const handleDelete = (product: Product) => {
    setDeletingProduct(product);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;

    setSaving(true);
    try {
      const url = editingProduct
        ? `/api/tob/admin/products/${editingProduct.id}`
        : "/api/tob/admin/products";
      const method = editingProduct ? "PATCH" : "POST";

      const payload: Record<string, unknown> = {
        name: formData.name,
      };

      // Add SLA values if provided
      if (formData.slaHighAccept) payload.slaHighAccept = parseInt(formData.slaHighAccept);
      if (formData.slaHighReply) payload.slaHighReply = parseInt(formData.slaHighReply);
      if (formData.slaMediumAccept) payload.slaMediumAccept = parseInt(formData.slaMediumAccept);
      if (formData.slaMediumReply) payload.slaMediumReply = parseInt(formData.slaMediumReply);
      if (formData.slaLowAccept) payload.slaLowAccept = parseInt(formData.slaLowAccept);
      if (formData.slaLowReply) payload.slaLowReply = parseInt(formData.slaLowReply);

      // Add team IDs if editing
      if (editingProduct && formData.teamIds) {
        payload.teamIds = formData.teamIds.split(",").map((id) => id.trim()).filter(Boolean);
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setDialogOpen(false);
        fetchProducts();
      }
    } catch (error) {
      console.error("Failed to save product:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingProduct) return;

    try {
      const res = await fetch(`/api/tob/admin/products/${deletingProduct.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setDeleteDialogOpen(false);
        setDeletingProduct(null);
        fetchProducts();
      }
    } catch (error) {
      console.error("Failed to delete product:", error);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.management.tabs.products}</CardTitle>
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
          <CardTitle>{t.management.tabs.products}</CardTitle>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            {t.management.products.create}
          </Button>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {t.management.noData.replace("{{type}}", t.management.tabs.products)}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>{t.management.products.namePlaceholder}</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead className="w-24">{t.common.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-mono text-xs">{product.id}</TableCell>
                    <TableCell>{product.name}</TableCell>
                    <TableCell className="font-mono text-xs">{product.tenantId}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(product)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(product)}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? t.management.products.edit : t.management.products.create}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>{t.management.products.namePlaceholder}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t.management.products.namePlaceholder}
              />
            </div>

            <div className="space-y-2">
              <Label>{t.management.products.sla}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  value={formData.slaHighAccept}
                  onChange={(e) => setFormData({ ...formData, slaHighAccept: e.target.value })}
                  placeholder={t.management.products.slaHighAccept}
                />
                <Input
                  type="number"
                  value={formData.slaHighReply}
                  onChange={(e) => setFormData({ ...formData, slaHighReply: e.target.value })}
                  placeholder={t.management.products.slaHighReply}
                />
                <Input
                  type="number"
                  value={formData.slaMediumAccept}
                  onChange={(e) => setFormData({ ...formData, slaMediumAccept: e.target.value })}
                  placeholder={t.management.products.slaMediumAccept}
                />
                <Input
                  type="number"
                  value={formData.slaMediumReply}
                  onChange={(e) => setFormData({ ...formData, slaMediumReply: e.target.value })}
                  placeholder={t.management.products.slaMediumReply}
                />
                <Input
                  type="number"
                  value={formData.slaLowAccept}
                  onChange={(e) => setFormData({ ...formData, slaLowAccept: e.target.value })}
                  placeholder={t.management.products.slaLowAccept}
                />
                <Input
                  type="number"
                  value={formData.slaLowReply}
                  onChange={(e) => setFormData({ ...formData, slaLowReply: e.target.value })}
                  placeholder={t.management.products.slaLowReply}
                />
              </div>
            </div>

            {editingProduct && (
              <div className="space-y-2">
                <Label>{t.management.products.bindTeams}</Label>
                <Input
                  value={formData.teamIds}
                  onChange={(e) => setFormData({ ...formData, teamIds: e.target.value })}
                  placeholder={t.management.products.bindTeamsPlaceholder}
                />
              </div>
            )}
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
        itemName={deletingProduct?.name || ""}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
