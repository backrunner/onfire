"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Archive, ArchiveRestore, Copy, FilePlus2, Pencil, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { api, swrFetcher } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import {
  createEmptyFormSchema,
  type FormSchema,
} from "@/lib/form-schema";
import { FormBuilder } from "@/components/admin/form-builder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { formatDateTime } from "@/lib/utils";
import {
  EmptyState,
  ErrorState,
  FormField,
  ManagerPanel,
  RowActions,
  TableSkeleton,
  errorMessage,
} from "./manager-ui";
import {
  ticketTypePathLabel,
  type TicketTypeAdminView,
} from "./ticket-type-management";

interface VersionView {
  id: string;
  version: number;
  formSchema: FormSchema | null;
  changeNote: string | null;
  createdAt: string;
  invalidatedAt: string | null;
  invalidationReason: string | null;
}

interface TemplateDetail {
  template: {
    id: string;
    ticketTypeId: string;
    currentVersionId: string | null;
    archivedAt: string | null;
  };
  versions: VersionView[];
}

export function TicketTemplateVersionManagement({ productId }: { productId?: string }) {
  const { t } = useI18n();
  const m = t.management.ticketTemplates;
  const { data: types, error: typesError, isLoading: typesLoading } = useSWR<TicketTypeAdminView[]>(
    "/api/tob/admin/ticket-types",
    swrFetcher
  );
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const selectedType = types?.find((item) => item.id === selectedTypeId) ?? null;
  const detailKey = selectedTypeId ? `/api/tob/admin/ticket-types/${selectedTypeId}/template` : null;
  const { data: detail, error, isLoading, mutate } = useSWR<TemplateDetail | null>(detailKey, swrFetcher);
  const [editorOpen, setEditorOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const byId = useMemo(() => new Map((types ?? []).map((item) => [item.id, item])), [types]);
  const options = useMemo(
    () => (types ?? [])
      .filter((item) => !item.systemKey && !item.archivedAt && (!productId || item.productId === productId))
      .map((item) => ({ id: item.id, label: ticketTypePathLabel(item, byId) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [types, byId, productId]
  );
  const current = detail?.versions.find((version) => version.id === detail.template.currentVersionId) ?? null;

  const saveVersion = async (schema: FormSchema) => {
    if (!selectedTypeId || !window.confirm(m.saveConfirm)) return;
    setPending(true);
    try {
      await api.post(`/api/tob/admin/ticket-types/${selectedTypeId}/template/versions`, {
        formSchema: schema,
      });
      toast.success(m.versionCreated);
      setEditorOpen(false);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, t.management.loadFailed));
    } finally {
      setPending(false);
    }
  };
  const cloneVersion = async (version: VersionView) => {
    if (!selectedTypeId || !window.confirm(m.restoreConfirm.replace("{{version}}", String(version.version)))) return;
    try {
      await api.post(`/api/tob/admin/ticket-types/${selectedTypeId}/template/versions/${version.id}/clone`, {
        changeNote: `Restored from v${version.version}`,
      });
      toast.success(m.versionCreated);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, t.management.loadFailed));
    }
  };
  const invalidate = async (version: VersionView) => {
    if (!selectedTypeId) return;
    const reason = window.prompt(m.invalidationReason);
    if (!reason?.trim()) return;
    try {
      await api.post(`/api/tob/admin/ticket-types/${selectedTypeId}/template/versions/${version.id}/invalidate`, { reason: reason.trim() });
      toast.success(t.management.toastUpdated);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, t.management.loadFailed));
    }
  };
  const setArchived = async (restore: boolean) => {
    if (!selectedTypeId) return;
    try {
      if (restore) await api.post(`/api/tob/admin/ticket-types/${selectedTypeId}/template/restore`);
      else await api.delete(`/api/tob/admin/ticket-types/${selectedTypeId}/template`);
      toast.success(t.management.toastUpdated);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, t.management.loadFailed));
    }
  };

  return (
    <>
      <ManagerPanel
        title={m.title}
        description={m.description}
        actions={selectedType && (
          <>
            {detail?.template.archivedAt ? (
              <Button variant="outline" size="sm" className="h-8" onClick={() => void setArchived(true)}><ArchiveRestore className="mr-1.5 size-3.5" />{m.restoreTemplate}</Button>
            ) : detail ? (
              <Button variant="outline" size="sm" className="h-8" onClick={() => void setArchived(false)}><Archive className="mr-1.5 size-3.5" />{m.archiveTemplate}</Button>
            ) : null}
            <Button size="sm" className="h-8" onClick={() => setEditorOpen(true)} disabled={Boolean(detail?.template.archivedAt)}>
              {current ? <Pencil className="mr-1.5 size-3.5" /> : <FilePlus2 className="mr-1.5 size-3.5" />}
              {current ? m.newVersion : m.createTemplate}
            </Button>
          </>
        )}
      >
        <div className="mb-4 max-w-md">
          <FormField label={m.type}>
            <Select value={selectedTypeId} onValueChange={setSelectedTypeId} disabled={typesLoading || options.length === 0}>
              <SelectTrigger className="h-8"><SelectValue placeholder={m.selectType} /></SelectTrigger>
              <SelectContent>{options.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
        </div>
        {typesError || error ? <ErrorState onRetry={() => void mutate()} /> : !selectedTypeId ? (
          <EmptyState message={m.selectTypeHint} />
        ) : isLoading ? <TableSkeleton /> : !detail || detail.versions.length === 0 ? (
          <EmptyState message={m.noVersions} />
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>{m.version}</TableHead><TableHead>{m.createdAt}</TableHead><TableHead>{m.note}</TableHead><TableHead>{m.status}</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
            <TableBody>
              {detail.versions.map((version) => {
                const isCurrent = detail.template.currentVersionId === version.id;
                return (
                  <TableRow key={version.id}>
                    <TableCell className="font-medium tabular-nums">v{version.version}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateTime(version.createdAt)}</TableCell>
                    <TableCell className="max-w-72 truncate text-sm text-muted-foreground">{version.changeNote || "—"}</TableCell>
                    <TableCell><Badge variant={version.invalidatedAt ? "destructive" : isCurrent ? "default" : "outline"}>{version.invalidatedAt ? m.invalidated : isCurrent ? m.current : m.valid}</Badge></TableCell>
                    <TableCell className="text-right"><RowActions actions={[
                      { label: m.copyAsNew, icon: Copy, onSelect: () => void cloneVersion(version) },
                      ...(!isCurrent && !version.invalidatedAt ? [{ label: m.invalidate, icon: ShieldX, separatorBefore: true, destructive: true, onSelect: () => void invalidate(version) }] : []),
                    ]} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </ManagerPanel>

      <Dialog open={editorOpen} onOpenChange={(open) => !pending && setEditorOpen(open)}>
        <DialogContent className="h-[85vh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-6xl">
          <DialogHeader><DialogTitle>{current ? `${m.newVersion} · v${current.version + 1}` : m.createTemplate}</DialogTitle></DialogHeader>
          <div className="-mx-6 -mb-6 min-h-0 overflow-hidden">
            <FormBuilder
              key={`${selectedTypeId}:${current?.id ?? "new"}`}
              initialSchema={current?.formSchema ?? createEmptyFormSchema()}
              onSave={(schema) => void saveVersion(schema)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
