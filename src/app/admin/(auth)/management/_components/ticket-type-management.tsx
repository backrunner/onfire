"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Archive, ArchiveRestore, FileText, Pencil, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, swrFetcher, ApiClientError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { parseI18nRecord, parseSupportedLanguages } from "@/lib/product-language";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  /** JSON `Record<lang, string>` companions; absent keys fall back to the base columns. */
  nameI18n: string | null;
  descriptionI18n: string | null;
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
  defaultLanguage: string;
  supportedLanguages: string | null;
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
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<TicketTypeAdminView[]>(
    productId ? `/api/tob/admin/ticket-types?productId=${encodeURIComponent(productId)}` : "/api/tob/admin/ticket-types",
    swrFetcher
  );
  const { data: products } = useSWR<ProductRef[]>("/api/tob/meta/products", swrFetcher);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TicketTypeAdminView | null>(null);
  const [pending, setPending] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [langTab, setLangTab] = useState("");
  const [form, setForm] = useState({
    productId: "",
    parentId: ROOT,
    name: "",
    description: "",
    nameI18n: {} as Record<string, string>,
    descriptionI18n: {} as Record<string, string>,
    sortOrder: "0",
  });

  const byId = useMemo(() => new Map((data ?? []).map((item) => [item.id, item])), [data]);
  const productNames = useMemo(
    () => new Map((products ?? []).map((product) => [product.id, product.name])),
    [products]
  );
  // Language tabs appear only when the dialog's product enables 2+ languages:
  // the default-language tab edits the base columns, the others edit the
  // per-language i18n companions.
  const dialogProduct = useMemo(
    () => (products ?? []).find((product) => product.id === form.productId),
    [products, form.productId]
  );
  const dialogDefaultLang = dialogProduct?.defaultLanguage ?? "en";
  const dialogLangs = useMemo(() => {
    const supported = parseSupportedLanguages(dialogProduct?.supportedLanguages);
    return supported.length >= 2
      ? [dialogDefaultLang, ...supported.filter((lang) => lang !== dialogDefaultLang)]
      : null;
  }, [dialogProduct, dialogDefaultLang]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? [])
      .filter((item) => !item.systemKey && (!productId || item.productId === productId))
      .map((item) => ({ item, path: ticketTypePathLabel(item, byId) }))
      .filter(({ path }) => !q || path.toLowerCase().includes(q))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [data, byId, productId, search]);

  const openCreate = () => {
    const initialProductId = productId ?? products?.[0]?.id ?? "";
    setEditing(null);
    setForm({ productId: initialProductId, parentId: ROOT, name: "", description: "", nameI18n: {}, descriptionI18n: {}, sortOrder: "0" });
    setLangTab((products ?? []).find((product) => product.id === initialProductId)?.defaultLanguage ?? "en");
    setDialogOpen(true);
  };
  const openEdit = (item: TicketTypeAdminView) => {
    setEditing(item);
    setForm({
      productId: item.productId,
      parentId: item.parentId ?? ROOT,
      name: item.name,
      description: item.description ?? "",
      nameI18n: parseI18nRecord(item.nameI18n) ?? {},
      descriptionI18n: parseI18nRecord(item.descriptionI18n) ?? {},
      sortOrder: String(item.sortOrder),
    });
    setLangTab((products ?? []).find((product) => product.id === item.productId)?.defaultLanguage ?? "en");
    setDialogOpen(true);
  };
  const translate = async () => {
    if (!dialogLangs || !form.productId) return;
    const targets = dialogLangs.filter((lang) => lang !== dialogDefaultLang);
    const texts: Array<{ id: string; text: string }> = [];
    if (form.name.trim()) texts.push({ id: "name", text: form.name.trim() });
    if (form.description.trim()) texts.push({ id: "description", text: form.description.trim() });
    if (targets.length === 0 || texts.length === 0) return;
    setTranslating(true);
    try {
      const result = await api.post<{ translations: Record<string, Record<string, string>> }>(
        "/api/tob/admin/ai/translate-content",
        { productId: form.productId, sourceLang: dialogDefaultLang, targetLangs: targets, texts }
      );
      setForm((current) => {
        const nameI18n = { ...current.nameI18n };
        const descriptionI18n = { ...current.descriptionI18n };
        for (const lang of targets) {
          const name = result.translations.name?.[lang];
          if (name) nameI18n[lang] = name;
          const description = result.translations.description?.[lang];
          if (description) descriptionI18n[lang] = description;
        }
        return { ...current, nameI18n, descriptionI18n };
      });
      toast.success(t.management.translation.applied);
      if (targets[0]) setLangTab(targets[0]);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 503) {
        toast.error(t.management.translation.notConfigured);
      } else {
        toast.error(errorMessage(err, t.management.translation.failed));
      }
    } finally {
      setTranslating(false);
    }
  };
  const save = async () => {
    if (!form.productId || !form.name.trim()) return;
    setPending(true);
    try {
      // Only multi-language products carry i18n companions; empty drafts
      // persist as null so stale translations are cleared.
      const prune = (map: Record<string, string>) => {
        const entries = Object.entries(map).filter(
          ([lang, value]) => value.trim() && dialogLangs?.includes(lang)
        );
        return entries.length > 0 ? Object.fromEntries(entries) : null;
      };
      const payload = {
        ...(!editing ? { productId: form.productId } : {}),
        parentId: form.parentId === ROOT ? null : form.parentId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        ...(dialogLangs
          ? { nameI18n: prune(form.nameI18n), descriptionI18n: prune(form.descriptionI18n) }
          : {}),
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
        {isLoading ? <TableSkeleton columns={productId ? 4 : 5} /> : error ? (
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
                      { label: m.manageTemplate, icon: FileText, onSelect: () => router.push(`/admin/management/products/${item.productId}/types/${item.id}`) },
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
              <Select value={form.productId} onValueChange={(value) => { setForm((f) => ({ ...f, productId: value, parentId: ROOT })); setLangTab((products ?? []).find((product) => product.id === value)?.defaultLanguage ?? "en"); }} disabled={Boolean(editing)}>
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
            {dialogLangs ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Tabs value={langTab} onValueChange={setLangTab}>
                    <TabsList>
                      {dialogLangs.map((lang) => (
                        <TabsTrigger key={lang} value={lang}>
                          {t.languages[lang as keyof typeof t.languages] ?? lang}
                          {lang === dialogDefaultLang ? ` · ${t.formBuilder.defaultTag}` : ""}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={() => void translate()}
                    disabled={translating || !form.name.trim()}
                  >
                    <Sparkles className="mr-1.5 size-3.5" />
                    {translating ? t.management.translation.translating : t.management.translation.translate}
                  </Button>
                </div>
                {langTab === dialogDefaultLang ? (
                  <>
                    <FormField label={m.name} required><Input className="h-8" value={form.name} onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))} /></FormField>
                    <FormField label={m.descriptionLabel}><Textarea rows={3} value={form.description} onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))} /></FormField>
                  </>
                ) : (
                  <>
                    <FormField label={m.name}>
                      <Input
                        className="h-8"
                        value={form.nameI18n[langTab] ?? ""}
                        placeholder={form.name || undefined}
                        onChange={(event) => setForm((f) => ({ ...f, nameI18n: { ...f.nameI18n, [langTab]: event.target.value } }))}
                      />
                    </FormField>
                    <FormField label={m.descriptionLabel}>
                      <Textarea
                        rows={3}
                        value={form.descriptionI18n[langTab] ?? ""}
                        placeholder={form.description || undefined}
                        onChange={(event) => setForm((f) => ({ ...f, descriptionI18n: { ...f.descriptionI18n, [langTab]: event.target.value } }))}
                      />
                    </FormField>
                  </>
                )}
              </div>
            ) : (
              <>
                <FormField label={m.name} required><Input className="h-8" value={form.name} onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))} /></FormField>
                <FormField label={m.descriptionLabel}><Textarea rows={3} value={form.description} onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))} /></FormField>
              </>
            )}
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
