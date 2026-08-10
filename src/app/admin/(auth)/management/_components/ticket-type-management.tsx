"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, swrFetcher } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyState,
  ErrorState,
  FormField,
  ManagerPanel,
  RowActions,
  TableSkeleton,
  errorMessage,
} from "./manager-ui";

export interface TicketTypeAdminView {
  id: string;
  productId: string;
  parentId: string | null;
  level: number;
  name: string;
  description: string | null;
  sortOrder: number;
  systemKey: "unclassified" | `legacy:${string}` | null;
  archivedAt: string | null;
  template: { id: string; currentVersionId: string | null; archivedAt: string | null } | null;
  currentVersion: { id: string; version: number; invalidatedAt: string | null } | null;
  route: { teamId: string } | null;
}

interface ProductRef {
  id: string;
  name: string;
}

const ROOT = "__root__";

export function ticketTypePathLabel(type: TicketTypeAdminView, byId: Map<string, TicketTypeAdminView>) {
  const names = [type.name];
  let parentId = type.parentId;
  const seen = new Set([type.id]);
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return names.join(" / ");
}

export function TicketTypeManagement({ productId }: { productId?: string }) {
  const { t } = useI18n();
  const m = t.management.ticketTypes;
  const { data, error, isLoading, mutate } = useSWR<TicketTypeAdminView[]>(
    "/api/tob/admin/ticket-types",
    swrFetcher
  );
  const { data: products } = useSWR<ProductRef[]>("/api/tob/meta/products", swrFetcher);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TicketTypeAdminView | null>(null);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    productId: "",
    parentId: ROOT,
    name: "",
    description: "",
    sortOrder: "0",
  });

  const byId = useMemo(() => new Map((data ?? []).map((item) => [item.id, item])), [data]);
  const productNames = useMemo(
    () => new Map((products ?? []).map((product) => [product.id, product.name])),
    [products]
  );
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? [])
      .filter((item) => !item.systemKey && (!productId || item.productId === productId))
      .map((item) => ({ item, path: ticketTypePathLabel(item, byId) }))
      .filter(({ path }) => !q || path.toLowerCase().includes(q))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [data, byId, productId, search]);

  const openCreate = () => {
    setEditing(null);
    setForm({ productId: productId ?? products?.[0]?.id ?? "", parentId: ROOT, name: "", description: "", sortOrder: "0" });
    setDialogOpen(true);
  };
  const openEdit = (item: TicketTypeAdminView) => {
    setEditing(item);
    setForm({
      productId: item.productId,
      parentId: item.parentId ?? ROOT,
      name: item.name,
      description: item.description ?? "",
      sortOrder: String(item.sortOrder),
    });
    setDialogOpen(true);
  };
  const save = async () => {
    if (!form.productId || !form.name.trim()) return;
    setPending(true);
    try {
      const payload = {
        ...(!editing ? { productId: form.productId } : {}),
        parentId: form.parentId === ROOT ? null : form.parentId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (editing) await api.patch(`/api/tob/admin/ticket-types/${editing.id}`, payload);
      else await api.post("/api/tob/admin/ticket-types", payload);
      toast.success(editing ? t.management.toastUpdated : t.management.toastCreated);
      setDialogOpen(false);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, t.management.loadFailed));
    } finally {
      setPending(false);
    }
  };
  const setArchived = async (item: TicketTypeAdminView, restore: boolean) => {
    try {
      if (restore) await api.post(`/api/tob/admin/ticket-types/${item.id}/restore`);
      else await api.delete(`/api/tob/admin/ticket-types/${item.id}`);
      toast.success(t.management.toastUpdated);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, t.management.loadFailed));
    }
  };

  const parents = (data ?? []).filter((item) => {
    if (
      item.systemKey ||
      item.archivedAt ||
      item.productId !== form.productId ||
      item.level >= 3 ||
      item.id === editing?.id
    ) {
      return false;
    }
    if (!editing) return true;
    let parentId = item.parentId;
    const seen = new Set<string>();
    while (parentId && !seen.has(parentId)) {
      if (parentId === editing.id) return false;
      seen.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    return true;
  });

  return (
    <>
      <ManagerPanel
        title={m.title}
        description={m.description}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={t.common.search}
        actions={
          <Button size="sm" className="h-8" onClick={openCreate} disabled={!products?.length}>
            <Plus className="mr-1.5 size-3.5" />
            {m.create}
          </Button>
        }
      >
        {isLoading ? <TableSkeleton /> : error ? (
          <ErrorState onRetry={() => void mutate()} />
        ) : visible.length === 0 ? (
          <EmptyState message={m.empty} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.path}</TableHead>
                {!productId && <TableHead>{m.product}</TableHead>}
                <TableHead>{m.template}</TableHead>
                <TableHead>{m.status}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(({ item, path }) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <p className="text-sm font-medium">{path}</p>
                    {item.description && <p className="line-clamp-1 text-xs text-muted-foreground">{item.description}</p>}
                  </TableCell>
                  {!productId && <TableCell className="text-sm text-muted-foreground">{productNames.get(item.productId) ?? item.productId}</TableCell>}
                  <TableCell className="text-sm">
                    {item.currentVersion ? `v${item.currentVersion.version}` : m.noTemplate}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.archivedAt ? "secondary" : "outline"}>
                      {item.archivedAt ? m.archived : m.active}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions actions={[
                      { label: t.common.edit, icon: Pencil, onSelect: () => openEdit(item) },
                      item.archivedAt
                        ? { label: m.restore, icon: ArchiveRestore, onSelect: () => void setArchived(item, true) }
                        : { label: m.archive, icon: Archive, separatorBefore: true, destructive: true, onSelect: () => void setArchived(item, false) },
                    ]} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ManagerPanel>

      <Dialog open={dialogOpen} onOpenChange={(open) => !pending && setDialogOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? m.edit : m.create}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {!productId && <FormField label={m.product} required>
              <Select value={form.productId} onValueChange={(value) => setForm((f) => ({ ...f, productId: value, parentId: ROOT }))} disabled={Boolean(editing)}>
                <SelectTrigger className="h-8"><SelectValue placeholder={m.selectProduct} /></SelectTrigger>
                <SelectContent>{(products ?? []).map((product) => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>}
            <FormField label={m.parent}>
              <Select value={form.parentId} onValueChange={(value) => setForm((f) => ({ ...f, parentId: value }))}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT}>{m.root}</SelectItem>
                  {parents.map((item) => <SelectItem key={item.id} value={item.id}>{ticketTypePathLabel(item, byId)}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={m.name} required><Input className="h-8" value={form.name} onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))} /></FormField>
            <FormField label={m.descriptionLabel}><Textarea rows={3} value={form.description} onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))} /></FormField>
            <FormField label={m.sortOrder}><Input type="number" className="h-8" value={form.sortOrder} onChange={(event) => setForm((f) => ({ ...f, sortOrder: event.target.value }))} /></FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={pending}>{t.common.cancel}</Button>
            <Button size="sm" onClick={() => void save()} disabled={pending || !form.productId || !form.name.trim()}>{pending ? t.common.loading : t.common.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
