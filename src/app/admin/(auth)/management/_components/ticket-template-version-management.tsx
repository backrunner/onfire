"use client";

import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  formatDateTime,
} from "./manager-ui";

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

export function TicketTemplateVersionManagement({ ticketTypeId }: { ticketTypeId: string }) {
  const { t } = useI18n();
  const m = t.management.ticketTemplates;
  const { data: detail, error, isLoading, mutate } = useSWR<TemplateDetail | null>(
    `/api/tob/admin/ticket-types/${ticketTypeId}/template`,
    swrFetcher
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorBaseId, setEditorBaseId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saveDraft, setSaveDraft] = useState<FormSchema | null>(null);
  const [cloneTarget, setCloneTarget] = useState<VersionView | null>(null);
  const [invalidateTarget, setInvalidateTarget] = useState<VersionView | null>(null);
  const [invalidateReason, setInvalidateReason] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);

  const current = detail?.versions.find((version) => version.id === detail.template.currentVersionId) ?? null;
  const editorBase = detail?.versions.find((version) => version.id === editorBaseId) ?? null;
  const archived = Boolean(detail?.template.archivedAt);

  const openEditor = (base: VersionView | null) => {
    setEditorBaseId(base?.id ?? null);
    setEditorOpen(true);
  };

  const saveVersion = async () => {
    if (!saveDraft) return;
    setPending(true);
    try {
      await api.post(`/api/tob/admin/ticket-types/${ticketTypeId}/template/versions`, {
        formSchema: saveDraft,
      });
      toast.success(m.versionCreated);
      setEditorOpen(false);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, t.management.loadFailed));
    } finally {
      setPending(false);
      setSaveDraft(null);
    }
  };

  const cloneVersion = async () => {
    if (!cloneTarget) return;
    setPending(true);
    try {
      await api.post(`/api/tob/admin/ticket-types/${ticketTypeId}/template/versions/${cloneTarget.id}/clone`, {
        changeNote: `Restored from v${cloneTarget.version}`,
      });
      toast.success(m.versionCreated);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, t.management.loadFailed));
    } finally {
      setPending(false);
      setCloneTarget(null);
    }
  };

  const invalidate = async () => {
    if (!invalidateTarget || !invalidateReason.trim()) return;
    setPending(true);
    try {
      await api.post(`/api/tob/admin/ticket-types/${ticketTypeId}/template/versions/${invalidateTarget.id}/invalidate`, { reason: invalidateReason.trim() });
      toast.success(t.management.toastUpdated);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, t.management.loadFailed));
    } finally {
      setPending(false);
      setInvalidateTarget(null);
      setInvalidateReason("");
    }
  };

  const setArchived = async (restore: boolean) => {
    setPending(true);
    try {
      if (restore) await api.post(`/api/tob/admin/ticket-types/${ticketTypeId}/template/restore`);
      else await api.delete(`/api/tob/admin/ticket-types/${ticketTypeId}/template`);
      toast.success(t.management.toastUpdated);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err, t.management.loadFailed));
    } finally {
      setPending(false);
      setArchiveOpen(false);
    }
  };

  const editorTitle = current
    ? `${m.newVersion} · v${current.version + 1}` +
      (editorBase && editorBase.id !== current.id
        ? ` (${m.basedOn.replace("{{version}}", String(editorBase.version))})`
        : "")
    : m.createTemplate;

  return (
    <>
      <ManagerPanel
        title={m.title}
        description={m.description}
        actions={detail && (
          <>
            {archived ? (
              <Button variant="outline" size="sm" className="h-8" onClick={() => void setArchived(true)}><ArchiveRestore className="mr-1.5 size-3.5" />{m.restoreTemplate}</Button>
            ) : (
              <Button variant="outline" size="sm" className="h-8" onClick={() => setArchiveOpen(true)}><Archive className="mr-1.5 size-3.5" />{m.archiveTemplate}</Button>
            )}
            <Button size="sm" className="h-8" onClick={() => openEditor(current)} disabled={archived}>
              {current ? <Pencil className="mr-1.5 size-3.5" /> : <FilePlus2 className="mr-1.5 size-3.5" />}
              {current ? m.newVersion : m.createTemplate}
            </Button>
          </>
        )}
      >
        {error ? <ErrorState onRetry={() => void mutate()} /> : isLoading ? <TableSkeleton columns={5} /> : !detail || detail.versions.length === 0 ? (
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
                      { label: m.editAsNew, icon: Pencil, onSelect: () => openEditor(version), disabled: archived },
                      { label: m.copyAsNew, icon: Copy, onSelect: () => setCloneTarget(version), disabled: archived },
                      ...(!isCurrent && !version.invalidatedAt ? [{ label: m.invalidate, icon: ShieldX, separatorBefore: true, destructive: true, onSelect: () => { setInvalidateReason(""); setInvalidateTarget(version); } }] : []),
                    ]} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </ManagerPanel>

      {/* Form editor */}
      <Dialog open={editorOpen} onOpenChange={(open) => !pending && setEditorOpen(open)}>
        <DialogContent className="h-[85vh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-6xl">
          <DialogHeader><DialogTitle>{editorTitle}</DialogTitle></DialogHeader>
          <div className="-mx-6 -mb-6 min-h-0 overflow-hidden">
            <FormBuilder
              key={`${ticketTypeId}:${editorBase?.id ?? current?.id ?? "new"}`}
              initialSchema={editorBase?.formSchema ?? current?.formSchema ?? createEmptyFormSchema()}
              onSave={(schema) => setSaveDraft(schema)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Archive confirmation */}
      <AlertDialog open={archiveOpen} onOpenChange={(open) => { if (!pending) setArchiveOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.archiveTemplate}</AlertDialogTitle>
            <AlertDialogDescription>{m.archiveConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={(event) => { event.preventDefault(); void setArchived(false); }}>
              {pending ? t.common.loading : t.common.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save confirmation */}
      <AlertDialog open={saveDraft !== null} onOpenChange={(open) => { if (!open && !pending) setSaveDraft(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{current ? m.newVersion : m.createTemplate}</AlertDialogTitle>
            <AlertDialogDescription>{m.saveConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={(event) => { event.preventDefault(); void saveVersion(); }}>
              {pending ? t.common.loading : t.common.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clone-as-new confirmation */}
      <AlertDialog open={cloneTarget !== null} onOpenChange={(open) => { if (!open && !pending) setCloneTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.copyAsNew}</AlertDialogTitle>
            <AlertDialogDescription>
              {cloneTarget ? m.restoreConfirm.replace("{{version}}", String(cloneTarget.version)) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={(event) => { event.preventDefault(); void cloneVersion(); }}>
              {pending ? t.common.loading : t.common.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invalidate reason */}
      <Dialog open={invalidateTarget !== null} onOpenChange={(open) => { if (!open && !pending) { setInvalidateTarget(null); setInvalidateReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{m.invalidate}</DialogTitle></DialogHeader>
          <FormField label={m.invalidationReason} required>
            <Input
              className="h-8"
              value={invalidateReason}
              onChange={(event) => setInvalidateReason(event.target.value)}
              autoFocus
            />
          </FormField>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setInvalidateTarget(null); setInvalidateReason(""); }} disabled={pending}>
              {t.common.cancel}
            </Button>
            <Button variant="destructive" size="sm" disabled={pending || !invalidateReason.trim()} onClick={() => void invalidate()}>
              {pending ? t.common.loading : m.invalidate}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
