"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Archive, ArchiveRestore, Copy, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, swrFetcher } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { useMe } from "@/lib/hooks/use-me";
import { parseI18nRecord, PRODUCT_LANGUAGES } from "@/lib/product-language";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ticketTypePathLabel, type TicketTypeAdminView } from "./ticket-type-management";
import {
  EmptyState,
  ErrorState,
  FormField,
  ManagerPanel,
  RowActions,
  TableSkeleton,
  errorMessage,
} from "./manager-ui";

interface PresetView {
  id: string;
  tenantId: string;
  parentId: string | null;
  level: number;
  name: string;
  description: string | null;
  /** JSON `Record<lang, string>` companions; absent keys fall back to the base columns. */
  nameI18n: string | null;
  descriptionI18n: string | null;
  sortOrder: number;
  archivedAt: string | null;
}

interface ProductRef { id: string; tenantId: string; name: string }
interface TenantRef { id: string; name: string }
const ROOT = "__root__";

function pathLabel(item: PresetView, byId: Map<string, PresetView>) {
  const names = [item.name];
  const seen = new Set([item.id]);
  let parentId = item.parentId;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return names.join(" / ");
}

export function TicketTypePresetManagement({ tenantId }: { tenantId?: string }) {
  const { t } = useI18n();
  const m = t.management.ticketTypePresets;
  const { me, can } = useMe();
  const canWrite = can("ticket_type.preset.write");
  const canManageTenants = can("tenant.manage");
  const { data, error, isLoading, mutate } = useSWR<PresetView[]>("/api/tob/admin/ticket-type-presets", swrFetcher);
  const { data: products } = useSWR<ProductRef[]>("/api/tob/meta/products", swrFetcher);
  const { data: types, mutate: mutateTypes } = useSWR<TicketTypeAdminView[]>("/api/tob/admin/ticket-types", swrFetcher);
  const { data: tenants } = useSWR<TenantRef[]>(canManageTenants ? "/api/tob/admin/tenants" : null, swrFetcher);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [editing, setEditing] = useState<PresetView | null>(null);
  const [pending, setPending] = useState(false);
  // Presets are tenant-owned and product-agnostic, so the dialog always offers
  // fixed en/zh tabs: the base columns hold the English text, the zh tab edits
  // the i18n companions.
  const [langTab, setLangTab] = useState<string>(PRODUCT_LANGUAGES[0]);
  const [form, setForm] = useState({ tenantId: "", parentId: ROOT, name: "", description: "", nameI18n: {} as Record<string, string>, descriptionI18n: {} as Record<string, string>, sortOrder: "0" });
  const [applyForm, setApplyForm] = useState({ presetId: "", productId: "", parentId: ROOT });

  const byId = useMemo(() => new Map((data ?? []).map((item) => [item.id, item])), [data]);
  const typeById = useMemo(() => new Map((types ?? []).map((item) => [item.id, item])), [types]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data ?? [])
      .filter((item) => !tenantId || item.tenantId === tenantId)
      .map((item) => ({ item, path: pathLabel(item, byId) }))
      .filter(({ path }) => !query || path.toLowerCase().includes(query))
      .sort((a, b) => a.item.tenantId.localeCompare(b.item.tenantId) || a.path.localeCompare(b.path));
  }, [byId, data, search, tenantId]);
  const tenantNames = useMemo(() => new Map((tenants ?? []).map((tenant) => [tenant.id, tenant.name])), [tenants]);
  const effectiveTenantId = tenantId || form.tenantId || me?.user.tenantId || "";
  const parents = (data ?? []).filter((item) => {
    if (item.tenantId !== effectiveTenantId || item.archivedAt || item.level >= 3 || item.id === editing?.id) return false;
    if (!editing) return true;
    const seen = new Set<string>();
    let parentId = item.parentId;
    while (parentId && !seen.has(parentId)) {
      if (parentId === editing.id) return false;
      seen.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    return true;
  });
  const selectedProduct = products?.find((product) => product.id === applyForm.productId);
  const productParents = (types ?? []).filter((type) => type.productId === applyForm.productId && !type.archivedAt && !type.systemKey && type.level < 3);
  const applicablePresets = (data ?? []).filter((preset) => !preset.archivedAt && (!selectedProduct || preset.tenantId === selectedProduct.tenantId));

  const openCreate = () => {
    setEditing(null);
    setForm({ tenantId: tenantId ?? me?.user.tenantId ?? tenants?.[0]?.id ?? "", parentId: ROOT, name: "", description: "", nameI18n: {}, descriptionI18n: {}, sortOrder: "0" });
    setLangTab(PRODUCT_LANGUAGES[0]);
    setDialogOpen(true);
  };
  const openEdit = (item: PresetView) => {
    setEditing(item);
    setForm({ tenantId: item.tenantId, parentId: item.parentId ?? ROOT, name: item.name, description: item.description ?? "", nameI18n: parseI18nRecord(item.nameI18n) ?? {}, descriptionI18n: parseI18nRecord(item.descriptionI18n) ?? {}, sortOrder: String(item.sortOrder) });
    setLangTab(PRODUCT_LANGUAGES[0]);
    setDialogOpen(true);
  };
  const openApply = () => {
    const productId = products?.find((item) => !tenantId || item.tenantId === tenantId)?.id ?? "";
    const product = products?.find((item) => item.id === productId);
    const presetId = (data ?? []).find((item) => !item.archivedAt && item.tenantId === product?.tenantId)?.id ?? "";
    setApplyForm({ presetId, productId, parentId: ROOT });
    setApplyOpen(true);
  };
  const save = async () => {
    if (!effectiveTenantId || !form.name.trim()) return;
    setPending(true);
    try {
      const prune = (map: Record<string, string>) => {
        const entries = Object.entries(map).filter(
          ([lang, value]) => value.trim() && (PRODUCT_LANGUAGES as readonly string[]).includes(lang)
        );
        return entries.length > 0 ? Object.fromEntries(entries) : null;
      };
      const payload = { ...(!editing && { tenantId: effectiveTenantId }), parentId: form.parentId === ROOT ? null : form.parentId, name: form.name.trim(), description: form.description.trim() || null, nameI18n: prune(form.nameI18n), descriptionI18n: prune(form.descriptionI18n), sortOrder: Number(form.sortOrder) || 0 };
      if (editing) await api.patch(`/api/tob/admin/ticket-type-presets/${editing.id}`, payload);
      else await api.post("/api/tob/admin/ticket-type-presets", payload);
      toast.success(editing ? t.management.toastUpdated : t.management.toastCreated);
      setDialogOpen(false);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, t.management.loadFailed));
    } finally { setPending(false); }
  };
  const applyPreset = async () => {
    if (!applyForm.presetId || !applyForm.productId) return;
    setPending(true);
    try {
      await api.post("/api/tob/admin/ticket-type-presets/apply", { presetId: applyForm.presetId, productId: applyForm.productId, parentId: applyForm.parentId === ROOT ? null : applyForm.parentId });
      toast.success(m.applied);
      setApplyOpen(false);
      await mutateTypes();
    } catch (err) {
      toast.error(errorMessage(err, t.management.loadFailed));
    } finally { setPending(false); }
  };
  const setArchived = async (item: PresetView, restore: boolean) => {
    try {
      if (restore) await api.post(`/api/tob/admin/ticket-type-presets/${item.id}/restore`);
      else await api.delete(`/api/tob/admin/ticket-type-presets/${item.id}`);
      toast.success(t.management.toastUpdated);
      await mutate();
    } catch (err) { toast.error(errorMessage(err, t.management.loadFailed)); }
  };

  return (
    <>
      <ManagerPanel title={m.title} description={m.description} searchValue={search} onSearchChange={setSearch} searchPlaceholder={t.common.search} actions={
        <>
          <Button variant="outline" size="sm" className="h-8" onClick={openApply} disabled={!products?.length || !data?.some((item) => !item.archivedAt)}><Copy className="mr-1.5 size-3.5" />{m.apply}</Button>
          {canWrite && <Button size="sm" className="h-8" onClick={openCreate}><Plus className="mr-1.5 size-3.5" />{m.create}</Button>}
        </>
      }>
        {isLoading ? <TableSkeleton
          columns={canManageTenants && !tenantId ? (canWrite ? 4 : 3) : canWrite ? 3 : 2}
          columnWidths={canManageTenants && !tenantId
            ? canWrite
              ? ["", "hidden md:table-cell", "hidden sm:table-cell", "w-12"]
              : ["", "hidden md:table-cell", "hidden sm:table-cell"]
            : canWrite
              ? ["", "hidden sm:table-cell", "w-12"]
              : ["", "hidden sm:table-cell"]}
        /> : error ? <ErrorState onRetry={() => void mutate()} /> : visible.length === 0 ? <EmptyState message={m.empty} /> : (
          <Table>
            <TableHeader><TableRow><TableHead>{m.path}</TableHead>{canManageTenants && !tenantId && <TableHead className="hidden md:table-cell">{m.tenant}</TableHead>}<TableHead className="hidden sm:table-cell">{m.status}</TableHead>{canWrite && <TableHead className="w-12" />}</TableRow></TableHeader>
            <TableBody>{visible.map(({ item, path }) => (
              <TableRow key={item.id}>
                <TableCell><div className="flex items-center gap-2"><p className="text-sm font-medium">{path}</p><Badge variant="outline" className={`sm:hidden ${item.archivedAt ? "text-muted-foreground" : "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"}`}>{item.archivedAt ? m.archived : m.active}</Badge></div>{item.description && <p className="line-clamp-1 text-xs text-muted-foreground">{item.description}</p>}{canManageTenants && <p className="mt-0.5 text-[11px] text-muted-foreground md:hidden">{tenantNames.get(item.tenantId) ?? item.tenantId}</p>}</TableCell>
                {canManageTenants && !tenantId && <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{tenantNames.get(item.tenantId) ?? item.tenantId}</TableCell>}
                <TableCell className="hidden sm:table-cell"><Badge variant="outline" className={item.archivedAt ? "text-muted-foreground" : "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"}>{item.archivedAt ? m.archived : m.active}</Badge></TableCell>
                {canWrite && <TableCell><RowActions actions={[{ label: m.edit, icon: Pencil, onSelect: () => openEdit(item) }, { label: item.archivedAt ? m.restore : m.archive, icon: item.archivedAt ? ArchiveRestore : Archive, destructive: !item.archivedAt, separatorBefore: true, onSelect: () => void setArchived(item, Boolean(item.archivedAt)) }]} /></TableCell>}
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </ManagerPanel>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent><DialogHeader><DialogTitle>{editing ? m.edit : m.create}</DialogTitle></DialogHeader><div className="space-y-4">
        {canManageTenants && !editing && <FormField label={m.tenant} required><Select value={form.tenantId} onValueChange={(tenantId) => setForm((current) => ({ ...current, tenantId, parentId: ROOT }))}><SelectTrigger><SelectValue placeholder={m.selectTenant} /></SelectTrigger><SelectContent>{tenants?.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>)}</SelectContent></Select></FormField>}
        <FormField label={m.parent}><Select value={form.parentId} onValueChange={(parentId) => setForm((current) => ({ ...current, parentId }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ROOT}>{m.root}</SelectItem>{parents.map((parent) => <SelectItem key={parent.id} value={parent.id}>{pathLabel(parent, byId)}</SelectItem>)}</SelectContent></Select></FormField>
        <Tabs value={langTab} onValueChange={setLangTab}>
          <TabsList>
            {PRODUCT_LANGUAGES.map((lang) => (
              <TabsTrigger key={lang} value={lang}>
                {t.languages[lang]}{lang === PRODUCT_LANGUAGES[0] ? ` · ${t.formBuilder.defaultTag}` : ""}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {langTab === PRODUCT_LANGUAGES[0] ? (
          <>
            <FormField label={m.name} required><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></FormField>
            <FormField label={m.descriptionLabel}><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></FormField>
          </>
        ) : (
          <>
            <FormField label={m.name}><Input value={form.nameI18n[langTab] ?? ""} placeholder={form.name || undefined} onChange={(event) => setForm((current) => ({ ...current, nameI18n: { ...current.nameI18n, [langTab]: event.target.value } }))} /></FormField>
            <FormField label={m.descriptionLabel}><Textarea value={form.descriptionI18n[langTab] ?? ""} placeholder={form.description || undefined} onChange={(event) => setForm((current) => ({ ...current, descriptionI18n: { ...current.descriptionI18n, [langTab]: event.target.value } }))} /></FormField>
          </>
        )}
        <FormField label={m.sortOrder}><Input type="number" value={form.sortOrder} onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))} /></FormField>
      </div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>{t.common.cancel}</Button><Button onClick={() => void save()} disabled={pending || !form.name.trim() || !effectiveTenantId}>{t.common.save}</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}><DialogContent><DialogHeader><DialogTitle>{m.apply}</DialogTitle></DialogHeader><div className="space-y-4">
        <FormField label={m.product} required><Select value={applyForm.productId} onValueChange={(productId) => { const product = products?.find((item) => item.id === productId); const presetId = (data ?? []).find((item) => !item.archivedAt && item.tenantId === product?.tenantId)?.id ?? ""; setApplyForm({ productId, presetId, parentId: ROOT }); }}><SelectTrigger><SelectValue placeholder={m.selectProduct} /></SelectTrigger><SelectContent>{products?.map((product) => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}</SelectContent></Select></FormField>
        <FormField label={m.preset} required><Select value={applyForm.presetId} onValueChange={(presetId) => setApplyForm((current) => ({ ...current, presetId }))}><SelectTrigger><SelectValue placeholder={m.selectPreset} /></SelectTrigger><SelectContent>{applicablePresets.map((preset) => <SelectItem key={preset.id} value={preset.id}>{pathLabel(preset, byId)}</SelectItem>)}</SelectContent></Select></FormField>
        <FormField label={m.targetParent}><Select value={applyForm.parentId} onValueChange={(parentId) => setApplyForm((current) => ({ ...current, parentId }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ROOT}>{m.productRoot}</SelectItem>{productParents.map((type) => <SelectItem key={type.id} value={type.id}>{ticketTypePathLabel(type, typeById)}</SelectItem>)}</SelectContent></Select></FormField>
        <p className="text-xs text-muted-foreground">{m.applyHint}</p>
      </div><DialogFooter><Button variant="outline" onClick={() => setApplyOpen(false)}>{t.common.cancel}</Button><Button onClick={() => void applyPreset()} disabled={pending || !applyForm.productId || !applyForm.presetId}>{m.apply}</Button></DialogFooter></DialogContent></Dialog>
    </>
  );
}
