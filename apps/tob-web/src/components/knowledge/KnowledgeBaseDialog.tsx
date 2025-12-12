import { useEffect, useState, useRef } from 'react';
import {
  Button,
  Input,
  Textarea,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@onfire/ui';
import {
  FileText,
  Upload,
  Trash2,
  Download,
  Plus,
  Pencil,
  BookOpen,
  File,
  RefreshCw,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import {
  listProductDocuments,
  uploadProductDocument,
  deleteProductDocument,
  downloadProductDocument,
  listProductKnowledge,
  createProductKnowledge,
  updateProductKnowledge,
  deleteProductKnowledge,
  type ProductDocument,
  type ProductKnowledge
} from '../../api';

interface KnowledgeBaseDialogProps {
  productId: string;
  productName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const KNOWLEDGE_TYPES = [
  { value: 'description', label: '产品描述' },
  { value: 'faq', label: 'FAQ' },
  { value: 'feature', label: '功能特性' },
  { value: 'policy', label: '政策条款' },
  { value: 'troubleshooting', label: '故障排查' }
] as const;

const getKnowledgeTypeLabel = (type: string) => {
  return KNOWLEDGE_TYPES.find((t) => t.value === type)?.label || type;
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getStatusBadge = (status: ProductDocument['status']) => {
  switch (status) {
    case 'ready':
      return <Badge variant="success" size="sm">就绪</Badge>;
    case 'processing':
      return <Badge variant="info" size="sm">处理中</Badge>;
    case 'pending':
      return <Badge variant="secondary" size="sm">待处理</Badge>;
    case 'error':
      return <Badge variant="error" size="sm">错误</Badge>;
    default:
      return <Badge variant="secondary" size="sm">{status}</Badge>;
  }
};

export function KnowledgeBaseDialog({ productId, productName, open, onOpenChange }: KnowledgeBaseDialogProps) {
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState<ProductDocument[]>([]);
  const [knowledge, setKnowledge] = useState<ProductKnowledge[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Knowledge form state
  const [showKnowledgeForm, setShowKnowledgeForm] = useState(false);
  const [editingKnowledge, setEditingKnowledge] = useState<ProductKnowledge | null>(null);
  const [knowledgeTitle, setKnowledgeTitle] = useState('');
  const [knowledgeContent, setKnowledgeContent] = useState('');
  const [knowledgeType, setKnowledgeType] = useState<string>('faq');

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'document' | 'knowledge'; id: string; name: string } | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [docsRes, knowledgeRes] = await Promise.all([
        listProductDocuments(productId),
        listProductKnowledge(productId)
      ]);
      setDocuments(docsRes.data || []);
      setKnowledge(knowledgeRes.data || []);
    } catch (err) {
      console.error('Failed to load knowledge base:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && productId) {
      refresh();
    }
  }, [open, productId]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadMessage(null);
    try {
      await uploadProductDocument(productId, file);
      setUploadMessage({ type: 'success', text: `文件 "${file.name}" 上传成功` });
      await refresh();
    } catch (err) {
      setUploadMessage({ type: 'error', text: `上传失败: ${err instanceof Error ? err.message : '未知错误'}` });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    setLoading(true);
    try {
      await deleteProductDocument(productId, docId);
      setConfirmDelete(null);
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadDocument = (docId: string) => {
    const url = downloadProductDocument(productId, docId);
    const token = localStorage.getItem('onfire.session');
    // Open in new window with auth
    window.open(`${url}?token=${token}`, '_blank');
  };

  const resetKnowledgeForm = () => {
    setKnowledgeTitle('');
    setKnowledgeContent('');
    setKnowledgeType('faq');
    setEditingKnowledge(null);
    setShowKnowledgeForm(false);
  };

  const handleSaveKnowledge = async () => {
    if (!knowledgeTitle || !knowledgeContent) return;

    setLoading(true);
    try {
      if (editingKnowledge) {
        await updateProductKnowledge(productId, editingKnowledge.id, {
          title: knowledgeTitle,
          content: knowledgeContent,
          knowledgeType
        });
      } else {
        await createProductKnowledge(productId, {
          title: knowledgeTitle,
          content: knowledgeContent,
          knowledgeType
        });
      }
      resetKnowledgeForm();
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  const handleEditKnowledge = (item: ProductKnowledge) => {
    setEditingKnowledge(item);
    setKnowledgeTitle(item.title);
    setKnowledgeContent(item.content);
    setKnowledgeType(item.knowledgeType);
    setShowKnowledgeForm(true);
  };

  const handleDeleteKnowledge = async (knowledgeId: string) => {
    setLoading(true);
    try {
      await deleteProductKnowledge(productId, knowledgeId);
      setConfirmDelete(null);
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            知识库管理 - {productName}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="documents" className="h-[60vh]">
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="documents">
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                文档 ({documents.length})
              </TabsTrigger>
              <TabsTrigger value="knowledge">
                <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                知识条目 ({knowledge.length})
              </TabsTrigger>
            </TabsList>
            <Button size="sm" variant="outline" onClick={refresh} loading={loading}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              刷新
            </Button>
          </div>

          {/* Documents Tab */}
          <TabsContent value="documents" className="h-[calc(100%-60px)]">
            <div className="space-y-4">
              {/* Upload Section */}
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,.json"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    支持文件格式: PDF, TXT, MD, JSON (最大 10MB)
                  </div>
                  <Button
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    loading={uploading}
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    上传文档
                  </Button>
                </div>
                {uploadMessage && (
                  <div
                    className={`mt-2 flex items-center gap-1.5 text-xs ${
                      uploadMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {uploadMessage.type === 'success' ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5" />
                    )}
                    {uploadMessage.text}
                  </div>
                )}
              </div>

              {/* Documents List */}
              <ScrollArea className="h-[calc(60vh-180px)]">
                <div className="space-y-2">
                  {documents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <File className="mb-2 h-8 w-8" />
                      <span className="text-sm">暂无文档</span>
                    </div>
                  ) : (
                    documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-8 w-8 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{doc.filename}</div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{formatFileSize(doc.sizeBytes)}</span>
                              <span>·</span>
                              <span>{doc.mimeType}</span>
                              <span>·</span>
                              {getStatusBadge(doc.status)}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadDocument(doc.id)}
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setConfirmDelete({ type: 'document', id: doc.id, name: doc.filename })
                            }
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          {/* Knowledge Tab */}
          <TabsContent value="knowledge" className="h-[calc(100%-60px)]">
            <div className="space-y-4">
              {/* Add Knowledge Button */}
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => {
                    resetKnowledgeForm();
                    setShowKnowledgeForm(true);
                  }}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  新建知识条目
                </Button>
              </div>

              {/* Knowledge Form */}
              {showKnowledgeForm && (
                <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">
                      {editingKnowledge ? '编辑知识条目' : '新建知识条目'}
                    </h4>
                    <Button size="sm" variant="outline" onClick={resetKnowledgeForm}>
                      取消
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      placeholder="标题"
                      value={knowledgeTitle}
                      onChange={(e) => setKnowledgeTitle(e.target.value)}
                    />
                    <Select value={knowledgeType} onValueChange={setKnowledgeType}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择类型" />
                      </SelectTrigger>
                      <SelectContent>
                        {KNOWLEDGE_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Textarea
                    placeholder="内容 (支持 Markdown)"
                    rows={4}
                    value={knowledgeContent}
                    onChange={(e) => setKnowledgeContent(e.target.value)}
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={handleSaveKnowledge}
                      loading={loading}
                      disabled={!knowledgeTitle || !knowledgeContent}
                    >
                      {editingKnowledge ? '保存' : '创建'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Knowledge List */}
              <ScrollArea className="h-[calc(60vh-220px)]">
                <div className="space-y-2">
                  {knowledge.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <BookOpen className="mb-2 h-8 w-8" />
                      <span className="text-sm">暂无知识条目</span>
                    </div>
                  ) : (
                    knowledge.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-border p-3 hover:bg-muted/50"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{item.title}</span>
                              <Badge variant="secondary" size="sm">
                                {getKnowledgeTypeLabel(item.knowledgeType)}
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                              {item.content}
                            </p>
                          </div>
                          <div className="flex gap-1 ml-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditKnowledge(item)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setConfirmDelete({ type: 'knowledge', id: item.id, name: item.title })
                              }
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>

        {/* Delete Confirmation Dialog */}
        <Dialog open={Boolean(confirmDelete)} onOpenChange={() => setConfirmDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                确认删除
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              确定删除 "{confirmDelete?.name}"？此操作不可撤销。
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDelete(null)}>
                取消
              </Button>
              <Button
                variant="outline"
                className="border-destructive text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (confirmDelete?.type === 'document') {
                    handleDeleteDocument(confirmDelete.id);
                  } else if (confirmDelete?.type === 'knowledge') {
                    handleDeleteKnowledge(confirmDelete.id);
                  }
                }}
                loading={loading}
              >
                删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
