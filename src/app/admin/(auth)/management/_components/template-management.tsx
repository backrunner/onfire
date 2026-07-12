"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api, swrFetcher } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormBuilder } from "@/components/admin/form-builder";
import {
  FormSchema,
  createEmptyFormSchema,
  parseFormSchema,
} from "@/lib/form-schema";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import {
  EmptyState,
  ErrorState,
  FormField,
  ManagerPanel,
  RowActions,
  TableSkeleton,
  errorMessage,
} from "./manager-ui";

interface TemplateView {
  id: string;
  productId: string;
  title: string;
  /** Parsed by the API: string[] (legacy rows may deviate). */
  categories: unknown;
  /** Parsed by the API: schema object (legacy rows may deviate). */
  formSchema: unknown;
}

interface ProductRef {
  id: string;
  name: string;
}

function toCategories(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim() !== "") {
    return value.split(",").map((c) => c.trim()).filter(Boolean);
  }
  return [];
}

function toFormSchema(value: unknown): FormSchema {
  if (typeof value === "string") {
    return parseFormSchema(value) ?? createEmptyFormSchema();
  }
  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as FormSchema).fields)
  ) {
    return value as FormSchema;
  }
  return createEmptyFormSchema();
}

export function TemplateManagement() {
  const { t } = useI18n();
  const m = t.management;

  const {
    data: templates,
    error,
    isLoading,
    mutate,
  } = useSWR<TemplateView[]>("/api/tob/admin/templates", swrFetcher);
  const { data: products } = useSWR<ProductRef[]>(
    "/api/tob/admin/products",
    swrFetcher
  );

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateView | null>(null);
  const [schemaTarget, setSchemaTarget] = useState<TemplateView | null>(null);
  const [deleting, setDeleting] = useState<TemplateView | null>(null);
  const [pending, setPending] = useState(false);

  // Basic-info form state
  const [formTitle, setFormTitle] = useState("");
  const [formProductId, setFormProductId] = useState("");
  const [formCategories, setFormCategories] = useState("");

  const productNames = useMemo(
    () => new Map((products ?? []).map((p) => [p.id, p.name])),
    [products]
  );

  const filtered = useMemo(() => {
    const list = templates ?? [];
    const q = search.trim().toLowerCase();
    return q ? list.filter((tpl) => tpl.title.toLowerCase().includes(q)) : list;
  }, [templates, search]);

  const openCreate = () => {
    setEditing(null);
    setFormTitle("");
    setFormProductId("");
    setFormCategories("");
    setDialogOpen(true);
  };

  const openEdit = (template: TemplateView) => {
    setEditing(template);
    setFormTitle(template.title);
    setFormProductId(template.productId);
    setFormCategories(toCategories(template.categories).join(", "));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim() || (!editing && !formProductId)) {
      toast.error(m.templates.titleRequired);
      return;
    }
    const categories = formCategories
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    setPending(true);
    try {
      if (editing) {
        await api.patch(`/api/tob/admin/templates/${editing.id}`, {
          title: formTitle.trim(),
          categories,
        });
        toast.success(m.toastUpdated);
      } else {
        await api.post("/api/tob/admin/templates", {
          productId: formProductId,
          title: formTitle.trim(),
          categories,
          formSchema: createEmptyFormSchema(),
        });
        toast.success(m.toastCreated);
      }
      setDialogOpen(false);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, m.loadFailed));
    } finally {
      setPending(false);
    }
  };

  const handleSaveSchema = async (schema: FormSchema) => {
    if (!schemaTarget) return;
    try {
      await api.patch(`/api/tob/admin/templates/${schemaTarget.id}`, {
        formSchema: schema,
      });
      toast.success(m.toastUpdated);
      setSchemaTarget(null);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, m.loadFailed));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await api.delete(`/api/tob/admin/templates/${deleting.id}`);
      toast.success(m.toastDeleted);
      setDeleting(null);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, m.loadFailed));
      throw err;
    }
  };

  return (
    <>
      <ManagerPanel
        title={m.tabs.templates}
        description={m.templates.description}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={t.common.search}
        actions={
          <Button size="sm" className="h-8" onClick={openCreate}>
            <Plus className="mr-1.5 size-3.5" />
            {m.templates.create}
          </Button>
        }
      >
        {isLoading ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState onRetry={() => void mutate()} />
        ) : filtered.length === 0 ? (
          <EmptyState message={m.noData.replace("{{type}}", m.tabs.templates)} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.templates.title}</TableHead>
                <TableHead>{m.templates.product}</TableHead>
                <TableHead>{m.templates.categories}</TableHead>
                <TableHead className="w-24">{m.templates.fields}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((template) => {
                const categories = toCategories(template.categories);
                const fieldCount = toFormSchema(template.formSchema).fields.length;
                return (
                  <TableRow key={template.id}>
                    <TableCell className="text-sm font-medium">
                      {template.title}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {productNames.get(template.productId) ?? template.productId}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {categories.slice(0, 3).map((cat) => (
                          <Badge key={cat} variant="secondary" className="text-xs">
                            {cat}
                          </Badge>
                        ))}
                        {categories.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{categories.length - 3}
                          </Badge>
                        )}
                        {categories.length === 0 && (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {fieldCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        actions={[
                          {
                            label: m.templates.editSchema,
                            icon: FileText,
                            onSelect: () => setSchemaTarget(template),
                          },
                          {
                            label: t.common.edit,
                            icon: Pencil,
                            onSelect: () => openEdit(template),
                          },
                          {
                            label: t.common.delete,
                            icon: Trash2,
                            destructive: true,
                            separatorBefore: true,
                            onSelect: () => setDeleting(template),
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </ManagerPanel>

      {/* Create / edit basic info */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !pending && setDialogOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? m.templates.edit : m.templates.create}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <FormField label={m.templates.title} htmlFor="template-title" required>
              <Input
                id="template-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder={m.templates.titlePlaceholder}
                className="h-8"
              />
            </FormField>
            {!editing && (
              <FormField label={m.templates.product} required>
                <Select value={formProductId} onValueChange={setFormProductId}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder={m.templates.selectProduct} />
                  </SelectTrigger>
                  <SelectContent>
                    {(products ?? []).map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}
            <FormField
              label={m.templates.categories}
              htmlFor="template-categories"
              hint={m.templates.categoriesHint}
            >
              <Input
                id="template-categories"
                value={formCategories}
                onChange={(e) => setFormCategories(e.target.value)}
                className="h-8"
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(false)}
              disabled={pending}
            >
              {t.common.cancel}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={pending}>
              {pending ? t.common.loading : t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schema editor */}
      <Dialog
        open={Boolean(schemaTarget)}
        onOpenChange={(open) => !open && setSchemaTarget(null)}
      >
        <DialogContent className="flex h-[85vh] flex-col sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>
              {m.templates.editSchema} · {schemaTarget?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="-mx-6 -mb-6 min-h-0 flex-1 overflow-hidden">
            {schemaTarget && (
              <FormBuilder
                initialSchema={toFormSchema(schemaTarget.formSchema)}
                onSave={handleSaveSchema}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={handleDelete}
        itemName={deleting?.title || ""}
      />
    </>
  );
}
