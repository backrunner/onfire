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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TicketTypeAdminView } from "./ticket-type-management";
import { ticketTypePathLabel } from "./ticket-type-management";
import { EmptyState, ErrorState, FormField, ManagerPanel, RowActions, TableSkeleton, errorMessage } from "./manager-ui";

interface ProductRef { id: string; name: string }
interface InternalStateView {
  id: string;
  ticketTypeId: string;
  name: string;
  description: string | null;
  kind: "boolean" | "select";
  options: string[];
  sortOrder: number;
  archivedAt: string | null;
}

export function TicketInternalStateManagement({ productId: fixedProductId }: { productId?: string }) {
  const { t } = useI18n();
  const m = t.management.internalStates;
  const { data: products } = useSWR<ProductRef[]>("/api/tob/meta/products", swrFetcher);
  const { data: types, error: typeError, isLoading: typeLoading, mutate: mutateTypes } = useSWR<TicketTypeAdminView[]>("/api/tob/admin/ticket-types", swrFetcher);
  const [productId, setProductId] = useState("");
  const [typeId, setTypeId] = useState("");
  const selectedProductId = fixedProductId || productId || products?.[0]?.id || "";
  const productTypes = (types ?? []).filter((type) => type.productId === selectedProductId && !type.systemKey && !type.archivedAt);
  const selectedTypeId = typeId && productTypes.some((type) => type.id === typeId) ? typeId : productTypes[0]?.id ?? "";
  const { data, error, isLoading, mutate } = useSWR<InternalStateView[]>(selectedTypeId ? `/api/tob/admin/ticket-types/${selectedTypeId}/internal-states` : null, swrFetcher);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InternalStateView | null>(null);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", kind: "boolean" as "boolean" | "select", options: "", sortOrder: "0" });
  const byId = useMemo(() => new Map((types ?? []).map((type) => [type.id, type])), [types]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "", kind: "boolean", options: "", sortOrder: "0" });
    setDialogOpen(true);
  };
  const openEdit = (item: InternalStateView) => {
    setEditing(item);
    setForm({ name: item.name, description: item.description ?? "", kind: item.kind, options: item.options.join("\n"), sortOrder: String(item.sortOrder) });
    setDialogOpen(true);
  };
  const save = async () => {
    if (!selectedTypeId || !form.name.trim()) return;
    setPending(true);
    try {
      const payload = { name: form.name.trim(), description: form.description.trim() || null, kind: form.kind, options: form.kind === "select" ? form.options.split("\n").map((value) => value.trim()).filter(Boolean) : null, sortOrder: Number(form.sortOrder) || 0 };
      const base = `/api/tob/admin/ticket-types/${selectedTypeId}/internal-states`;
      if (editing) await api.patch(`${base}/${editing.id}`, payload);
      else await api.post(base, payload);
      toast.success(editing ? t.management.toastUpdated : t.management.toastCreated);
      setDialogOpen(false);
      await mutate();
    } catch (err) { toast.error(errorMessage(err, t.management.loadFailed)); }
    finally { setPending(false); }
  };
  const setArchived = async (item: InternalStateView, restore: boolean) => {
    try {
      const base = `/api/tob/admin/ticket-types/${selectedTypeId}/internal-states/${item.id}`;
      if (restore) await api.post(`${base}/restore`); else await api.delete(base);
      toast.success(t.management.toastUpdated);
      await mutate();
    } catch (err) { toast.error(errorMessage(err, t.management.loadFailed)); }
  };

  return (
    <>
      <ManagerPanel title={m.title} description={m.description} actions={<Button size="sm" className="h-8" onClick={openCreate} disabled={!selectedTypeId}><Plus className="mr-1.5 size-3.5" />{m.create}</Button>}>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          {!fixedProductId && <FormField label={m.product}><Select value={selectedProductId} onValueChange={(value) => { setProductId(value); setTypeId(""); }}><SelectTrigger><SelectValue placeholder={m.selectProduct} /></SelectTrigger><SelectContent>{products?.map((product) => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}</SelectContent></Select></FormField>}
          <FormField label={m.ticketType}><Select value={selectedTypeId} onValueChange={setTypeId} disabled={!productTypes.length}><SelectTrigger><SelectValue placeholder={productTypes.length ? m.selectType : m.noTypes} /></SelectTrigger><SelectContent>{productTypes.map((type) => <SelectItem key={type.id} value={type.id}>{ticketTypePathLabel(type, byId)}</SelectItem>)}</SelectContent></Select></FormField>
        </div>
        {typeLoading || isLoading ? <TableSkeleton columns={5} columnWidths={["", "", "hidden md:table-cell", "hidden md:table-cell", "w-12"]} /> : typeError || error ? <ErrorState onRetry={() => { void mutateTypes(); void mutate(); }} /> : !selectedTypeId || !data?.length ? <EmptyState message={selectedTypeId ? m.empty : m.noTypes} /> : (
          <Table><TableHeader><TableRow><TableHead>{m.name}</TableHead><TableHead>{m.kind}</TableHead><TableHead className="hidden md:table-cell">{m.options}</TableHead><TableHead className="hidden md:table-cell">{m.status}</TableHead><TableHead className="w-12" /></TableRow></TableHeader><TableBody>{data.map((item) => (
            <TableRow key={item.id}><TableCell><div className="flex items-center gap-2"><p className="text-sm font-medium">{item.name}</p><Badge variant="outline" className={`md:hidden ${item.archivedAt ? "text-muted-foreground" : "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"}`}>{item.archivedAt ? m.archived : m.active}</Badge></div>{item.description && <p className="line-clamp-1 text-xs text-muted-foreground">{item.description}</p>}{item.kind === "select" && <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground md:hidden">{item.options.join(", ")}</p>}</TableCell><TableCell className="whitespace-nowrap text-sm">{item.kind === "boolean" ? m.boolean : m.select}</TableCell><TableCell className="hidden max-w-xs truncate text-sm text-muted-foreground md:table-cell">{item.kind === "select" ? item.options.join(", ") : "—"}</TableCell><TableCell className="hidden md:table-cell"><Badge variant="outline" className={item.archivedAt ? "text-muted-foreground" : "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"}>{item.archivedAt ? m.archived : m.active}</Badge></TableCell><TableCell><RowActions actions={[{ label: m.edit, icon: Pencil, disabled: Boolean(item.archivedAt), onSelect: () => openEdit(item) }, { label: item.archivedAt ? m.restore : m.archive, icon: item.archivedAt ? ArchiveRestore : Archive, destructive: !item.archivedAt, separatorBefore: true, onSelect: () => void setArchived(item, Boolean(item.archivedAt)) }]} /></TableCell></TableRow>
          ))}</TableBody></Table>
        )}
      </ManagerPanel>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent><DialogHeader><DialogTitle>{editing ? m.edit : m.create}</DialogTitle></DialogHeader><div className="space-y-4">
        <FormField label={m.name} required><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></FormField>
        <FormField label={m.descriptionLabel}><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></FormField>
        <FormField label={m.kind}><Select value={form.kind} onValueChange={(kind: "boolean" | "select") => setForm((current) => ({ ...current, kind }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="boolean">{m.boolean}</SelectItem><SelectItem value="select">{m.select}</SelectItem></SelectContent></Select></FormField>
        {form.kind === "select" && <FormField label={m.options} required hint={m.optionsHint}><Textarea value={form.options} onChange={(event) => setForm((current) => ({ ...current, options: event.target.value }))} /></FormField>}
        <FormField label={m.sortOrder}><Input type="number" value={form.sortOrder} onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))} /></FormField>
      </div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>{t.common.cancel}</Button><Button onClick={() => void save()} disabled={pending || !form.name.trim() || (form.kind === "select" && !form.options.trim())}>{t.common.save}</Button></DialogFooter></DialogContent></Dialog>
    </>
  );
}
