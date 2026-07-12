"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  BookOpen,
  FileText,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api, swrFetcher, qs, ApiClientError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { ProductSelect, useProducts } from "@/components/admin/product-select";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

const KNOWLEDGE_TYPES = [
  "description",
  "faq",
  "feature",
  "policy",
  "troubleshooting",
] as const;

type KnowledgeType = (typeof KNOWLEDGE_TYPES)[number];
type DocumentStatus = "pending" | "processing" | "ready" | "error";

interface KnowledgeView {
  id: string;
  productId: string;
  title: string;
  content: string;
  knowledgeType: KnowledgeType;
  createdAt: string;
  updatedAt: string;
}

interface DocumentView {
  id: string;
  productId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus | null;
  errorMessage: string | null;
  createdAt: string;
}

const ACCEPTED_FILES = ".pdf,.txt,.md,.doc,.docx";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const DOC_STATUS_STYLES: Record<DocumentStatus, string> = {
  pending: "bg-zinc-500/10 text-zinc-600 ring-zinc-500/20 dark:text-zinc-400",
  processing:
    "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400",
  ready:
    "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400",
  error: "bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-400",
};

export function KnowledgeTab() {
  const { t } = useI18n();
  const k = t.aiKnowledge;
  const { data: products, isLoading: productsLoading } = useProducts();
  const [productId, setProductId] = useState("");

  const entriesKey = productId
    ? `/api/tob/admin/ai/knowledge${qs({ productId })}`
    : null;
  const documentsKey = productId
    ? `/api/tob/admin/ai/documents${qs({ productId })}`
    : null;

  const {
    data: entries,
    error: entriesError,
    isLoading: entriesLoading,
    mutate: mutateEntries,
  } = useSWR<KnowledgeView[]>(entriesKey, swrFetcher);
  const {
    data: documents,
    error: documentsError,
    isLoading: documentsLoading,
    mutate: mutateDocuments,
  } = useSWR<DocumentView[]>(documentsKey, swrFetcher);

  // Entry dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeView | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [knowledgeType, setKnowledgeType] = useState<KnowledgeType>("faq");
  const [pending, setPending] = useState(false);

  // Deletion state (entry or document)
  const [deleting, setDeleting] = useState<
    { kind: "entry" | "document"; id: string; name: string } | null
  >(null);

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const noProducts = !productsLoading && (products?.length ?? 0) === 0;

  const openCreate = () => {
    setEditing(null);
    setTitle("");
    setContent("");
    setKnowledgeType("faq");
    setDialogOpen(true);
  };

  const openEdit = (entry: KnowledgeView) => {
    setEditing(entry);
    setTitle(entry.title);
    setContent(entry.content);
    setKnowledgeType(entry.knowledgeType);
    setDialogOpen(true);
  };

  const saveEntry = async () => {
    if (!title.trim()) {
      toast.error(k.titleRequired);
      return;
    }
    if (!content.trim()) {
      toast.error(k.contentRequired);
      return;
    }
    setPending(true);
    try {
      if (editing) {
        await api.patch(`/api/tob/admin/ai/knowledge/${editing.id}`, {
          title: title.trim(),
          content: content.trim(),
          knowledgeType,
        });
      } else {
        await api.post("/api/tob/admin/ai/knowledge", {
          productId,
          title: title.trim(),
          content: content.trim(),
          knowledgeType,
        });
      }
      toast.success(k.saved);
      setDialogOpen(false);
      void mutateEntries();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : k.saveFailed);
    } finally {
      setPending(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    try {
      await api.delete(
        target.kind === "entry"
          ? `/api/tob/admin/ai/knowledge/${target.id}`
          : `/api/tob/admin/ai/documents/${target.id}`
      );
      toast.success(k.deleted);
      if (target.kind === "entry") void mutateEntries();
      else void mutateDocuments();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : k.actionFailed);
    } finally {
      setDeleting(null);
    }
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("productId", productId);
      await api.postForm("/api/tob/admin/ai/documents", form);
      toast.success(k.uploaded);
      void mutateDocuments();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : k.uploadFailed);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (noProducts) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-1.5 py-12 text-center">
          <Package className="size-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">{k.noProducts}</p>
          <p className="text-xs text-muted-foreground">{k.noProductsHint}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{k.subtitle}</p>
        <ProductSelect
          value={productId}
          onChange={setProductId}
          placeholder={k.selectProduct}
          emptyLabel={k.noProducts}
          autoSelectFirst
        />
      </div>

      {!productId ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* Knowledge entries */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{k.entries}</CardTitle>
                <CardDescription className="mt-1 text-xs">
                  {k.entriesHint}
                </CardDescription>
              </div>
              <Button size="sm" className="h-8" onClick={openCreate}>
                <Plus className="size-4" />
                {k.addEntry}
              </Button>
            </CardHeader>
            <CardContent>
              {entriesLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : entriesError ? (
                <LoadError message={k.loadFailed} retryLabel={k.retry} onRetry={() => void mutateEntries()} />
              ) : (entries?.length ?? 0) === 0 ? (
                <EmptyHint
                  icon={<BookOpen className="size-8 text-muted-foreground/40" />}
                  title={k.empty}
                  hint={k.emptyHint}
                />
              ) : (
                <ul className="divide-y divide-border">
                  {entries!.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {entry.title}
                          </span>
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {k.types[entry.knowledgeType]}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {entry.content}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => openEdit(entry)}
                        aria-label={t.common.edit}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-red-600 hover:text-red-600 dark:text-red-400"
                        onClick={() =>
                          setDeleting({
                            kind: "entry",
                            id: entry.id,
                            name: entry.title,
                          })
                        }
                        aria-label={t.common.delete}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Documents */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{k.documents}</CardTitle>
                <CardDescription className="mt-1 text-xs">
                  {k.documentsHint}
                </CardDescription>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILES}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadFile(file);
                }}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                {k.upload}
              </Button>
            </CardHeader>
            <CardContent>
              {documentsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : documentsError ? (
                <LoadError message={k.loadFailed} retryLabel={k.retry} onRetry={() => void mutateDocuments()} />
              ) : (documents?.length ?? 0) === 0 ? (
                <EmptyHint
                  icon={<FileText className="size-8 text-muted-foreground/40" />}
                  title={k.emptyDocs}
                />
              ) : (
                <ul className="divide-y divide-border">
                  {documents!.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {doc.filename}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(doc.sizeBytes)}
                        </p>
                      </div>
                      {doc.status && (
                        <span
                          className={cn(
                            "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                            DOC_STATUS_STYLES[doc.status]
                          )}
                          title={doc.errorMessage ?? undefined}
                        >
                          {k.docStatus[doc.status]}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-red-600 hover:text-red-600 dark:text-red-400"
                        onClick={() =>
                          setDeleting({
                            kind: "document",
                            id: doc.id,
                            name: doc.filename,
                          })
                        }
                        aria-label={t.common.delete}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Create / edit entry dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !pending && setDialogOpen(open)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? k.editEntry : k.addEntry}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
              <div className="space-y-1.5">
                <Label htmlFor="knowledge-title">{k.entryTitle}</Label>
                <Input
                  id="knowledge-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={500}
                  className="h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{k.entryType}</Label>
                <Select
                  value={knowledgeType}
                  onValueChange={(v) => setKnowledgeType(v as KnowledgeType)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KNOWLEDGE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {k.types[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="knowledge-content">{k.entryContent}</Label>
              <Textarea
                id="knowledge-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                className="text-sm"
              />
            </div>
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
            <Button size="sm" onClick={saveEntry} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleting?.kind === "document" ? k.deleteDocTitle : k.deleteEntryTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {k.deleteMessage.replace("{{name}}", deleting?.name ?? "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyHint({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-10 text-center">
      {icon}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function LoadError({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="size-4" />
        {retryLabel}
      </Button>
    </div>
  );
}
