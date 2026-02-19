"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FormBuilder } from "@/components/admin/form-builder";
import { FormSchema, createEmptyFormSchema, parseFormSchema } from "@/lib/form-schema";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";

interface Template {
  id: string;
  productId: string;
  title: string;
  categories: string;
  formSchema: string;
}

interface Product {
  id: string;
  name: string;
}

export function TemplateManagement() {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formProductId, setFormProductId] = useState("");
  const [formCategories, setFormCategories] = useState("");
  const [formSchema, setFormSchema] = useState<FormSchema>(createEmptyFormSchema());

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [templatesRes, productsRes] = await Promise.all([
        fetch("/api/tob/admin/templates"),
        fetch("/api/tob/admin/products"),
      ]);

      if (templatesRes.ok) {
        const data = (await templatesRes.json()) as { data?: Template[] };
        setTemplates(data.data || []);
      }

      if (productsRes.ok) {
        const data = (await productsRes.json()) as { data?: Product[] };
        setProducts(data.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormTitle("");
    setFormProductId("");
    setFormCategories("");
    setFormSchema(createEmptyFormSchema());
    setEditingTemplate(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  const openEditDialog = (template: Template) => {
    setEditingTemplate(template);
    setFormTitle(template.title);
    setFormProductId(template.productId);
    setFormCategories(template.categories);
    const parsed = parseFormSchema(template.formSchema);
    setFormSchema(parsed || createEmptyFormSchema());
    setIsCreateOpen(true);
  };

  const openSchemaEditor = (template: Template) => {
    setEditingTemplate(template);
    const parsed = parseFormSchema(template.formSchema);
    setFormSchema(parsed || createEmptyFormSchema());
    setIsEditorOpen(true);
  };

  const handleSaveBasicInfo = async () => {
    try {
      const body = {
        title: formTitle,
        productId: formProductId,
        categories: formCategories,
        formSchema: JSON.stringify(formSchema),
      };

      const url = editingTemplate
        ? `/api/tob/admin/templates/${editingTemplate.id}`
        : "/api/tob/admin/templates";
      const method = editingTemplate ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setIsCreateOpen(false);
        resetForm();
        fetchData();
      }
    } catch (error) {
      console.error("Failed to save template:", error);
    }
  };

  const handleSaveSchema = async (schema: FormSchema) => {
    if (!editingTemplate) return;

    try {
      const res = await fetch(`/api/tob/admin/templates/${editingTemplate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formSchema: JSON.stringify(schema) }),
      });

      if (res.ok) {
        setIsEditorOpen(false);
        fetchData();
      }
    } catch (error) {
      console.error("Failed to save schema:", error);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      const res = await fetch(`/api/tob/admin/templates/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setDeleteTarget(null);
        fetchData();
      }
    } catch (error) {
      console.error("Failed to delete template:", error);
    }
  };

  const getProductName = (productId: string) => {
    return products.find((p) => p.id === productId)?.name || productId;
  };

  const parseCategories = (categories: string): string[] => {
    try {
      return JSON.parse(categories);
    } catch {
      return categories.split(",").map((c) => c.trim());
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Templates</h3>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Create Template
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Categories</TableHead>
            <TableHead>Fields</TableHead>
            <TableHead className="w-[120px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No templates yet
              </TableCell>
            </TableRow>
          ) : (
            templates.map((template) => {
              const schema = parseFormSchema(template.formSchema);
              const fieldCount = schema?.fields.length || 0;
              const categories = parseCategories(template.categories);

              return (
                <TableRow key={template.id}>
                  <TableCell className="font-medium">{template.title}</TableCell>
                  <TableCell>{getProductName(template.productId)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {categories.slice(0, 3).map((cat, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {cat}
                        </Badge>
                      ))}
                      {categories.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{categories.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{fieldCount} fields</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openSchemaEditor(template)}
                        title="Edit Form Schema"
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(template)}
                        title="Edit Template"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(template)}
                        title="Delete Template"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Template" : "Create Template"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Template title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="product">Product</Label>
              <Select value={formProductId} onValueChange={setFormProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="categories">Categories (comma-separated)</Label>
              <Input
                id="categories"
                value={formCategories}
                onChange={(e) => setFormCategories(e.target.value)}
                placeholder="Technical Support, Billing, General"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveBasicInfo}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Schema Editor Dialog */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-6xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              Edit Form Schema - {editingTemplate?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden -mx-6 -mb-6">
            <FormBuilder
              initialSchema={formSchema}
              onSave={handleSaveSchema}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDelete}
        itemName={deleteTarget?.title || ""}
      />
    </div>
  );
}
