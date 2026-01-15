import { useState, useEffect } from 'react';
import {
  Button,
  Input,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Badge,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Switch,
  Label,
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton
} from '@onfire/ui';
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  Eye,
  Code,
  AlertCircle,
  Loader2,
  CheckCircle2
} from 'lucide-react';
import {
  getEmailConfigMeta,
  listEmailTemplates,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  type EmailTemplate,
  type EmailConfigMeta
} from '../../api';

interface EmailTemplatePanelProps {
  products: Array<{ id: string; name: string }>;
  onSuccess?: () => void;
}

export function EmailTemplatePanel({ products, onSuccess }: EmailTemplatePanelProps) {
  const [meta, setMeta] = useState<EmailConfigMeta | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<Partial<EmailTemplate> | null>(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setInitialLoading(true);
    await Promise.all([loadMeta(), loadTemplates()]);
    setInitialLoading(false);
  };

  const loadMeta = async () => {
    try {
      const data = await getEmailConfigMeta();
      setMeta(data);
    } catch (err) {
      console.error('Failed to load email config meta:', err);
    }
  };

  const loadTemplates = async () => {
    try {
      const { data } = await listEmailTemplates();
      setTemplates(data);
    } catch (err) {
      console.error('Failed to load email templates:', err);
    }
  };

  const handleCreateOrUpdate = async () => {
    if (!editingTemplate || !editingTemplate.productId || !editingTemplate.templateType) {
      setError('Product and template type are required');
      return;
    }

    if (!editingTemplate.subjectTemplate || !editingTemplate.bodyTemplate) {
      setError('Subject and body templates are required');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      if (editingTemplate.id) {
        await updateEmailTemplate(editingTemplate.id, {
          subjectTemplate: editingTemplate.subjectTemplate,
          bodyTemplate: editingTemplate.bodyTemplate,
          enabled: editingTemplate.enabled
        });
        setSuccessMessage('Template updated successfully');
      } else {
        await createEmailTemplate({
          productId: editingTemplate.productId,
          templateType: editingTemplate.templateType,
          subjectTemplate: editingTemplate.subjectTemplate,
          bodyTemplate: editingTemplate.bodyTemplate,
          enabled: editingTemplate.enabled ?? true
        });
        setSuccessMessage('Template created successfully');
      }

      await loadTemplates();
      setShowTemplateDialog(false);
      setEditingTemplate(null);
      onSuccess?.();

      // Auto-clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setTemplateToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!templateToDelete) return;

    try {
      await deleteEmailTemplate(templateToDelete);
      await loadTemplates();
      setSuccessMessage('Template deleted successfully');
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
      onSuccess?.();

      // Auto-clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Delete failed');
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
    }
  };

  const openEditDialog = (template?: EmailTemplate) => {
    if (template) {
      setEditingTemplate(template);
    } else {
      setEditingTemplate({
        productId: products[0]?.id,
        templateType: 'ticket_created',
        subjectTemplate: '',
        bodyTemplate: '',
        enabled: true
      });
    }
    setShowTemplateDialog(true);
  };

  const openPreviewDialog = (template: EmailTemplate) => {
    setPreviewTemplate(template);
    setShowPreviewDialog(true);
  };

  const getTemplateTypeName = (type: string) => {
    const names: Record<string, string> = {
      ticket_created: 'Ticket Created',
      ticket_replied: 'Ticket Replied',
      ticket_closed: 'Ticket Closed',
      ticket_escalated: 'Ticket Escalated'
    };
    return names[type] || type;
  };

  const getDefaultTemplate = (type: string) => {
    return meta?.defaultTemplates?.[type] || { subject: '', body: '' };
  };

  const renderPreview = (template: string) => {
    return template
      .replace(/\{\{ticket_id\}\}/g, 'ABC123')
      .replace(/\{\{subject\}\}/g, 'Sample Ticket Subject')
      .replace(/\{\{customer_name\}\}/g, 'John Doe')
      .replace(/\{\{customer_email\}\}/g, 'john@example.com')
      .replace(/\{\{agent_name\}\}/g, 'Support Agent')
      .replace(/\{\{reply_content\}\}/g, 'This is a sample reply content.')
      .replace(/\{\{product_name\}\}/g, 'Sample Product');
  };

  return (
    <div className="space-y-6">
      {/* Loading State */}
      {initialLoading ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-96" />
            </div>
            <Skeleton className="h-9 w-32" />
          </div>
          <Skeleton className="h-24 w-full" />
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : (
        <>
          {/* Success/Error Messages */}
          {successMessage && (
            <Alert variant="success">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Email Templates</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Customize email notification templates for different events
              </p>
            </div>
            <Button onClick={() => openEditDialog()} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Template
            </Button>
          </div>

          {/* Template Variables Info */}
          <Alert variant="info">
            <Code className="h-4 w-4" />
            <AlertDescription>
              <div className="font-medium mb-2">Available Variables</div>
              <div className="grid grid-cols-2 gap-2 text-sm font-mono">
                <code>{'{{ticket_id}}'}</code>
                <code>{'{{subject}}'}</code>
                <code>{'{{customer_name}}'}</code>
                <code>{'{{customer_email}}'}</code>
                <code>{'{{agent_name}}'}</code>
                <code>{'{{reply_content}}'}</code>
                <code>{'{{product_name}}'}</code>
              </div>
            </AlertDescription>
          </Alert>

          {/* Templates List */}
          <ScrollArea className="h-[600px]">
            <div className="space-y-4">
              {products.map((product) => {
                const productTemplates = templates.filter(t => t.productId === product.id);

                return (
                  <Card key={product.id}>
                    <CardHeader>
                      <CardTitle>{product.name}</CardTitle>
                      <CardDescription>
                        {productTemplates.length} custom template(s)
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {productTemplates.length > 0 ? (
                        <div className="space-y-3">
                          {productTemplates.map((template) => (
                            <div
                              key={template.id}
                              className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700"
                            >
                              <div className="flex items-center gap-3">
                                <FileText className="w-4 h-4 text-zinc-500" />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                      {getTemplateTypeName(template.templateType)}
                                    </span>
                                    <Badge variant={template.enabled ? 'default' : 'secondary'}>
                                      {template.enabled ? 'Enabled' : 'Disabled'}
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 font-mono">
                                    {template.subjectTemplate}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  onClick={() => openPreviewDialog(template)}
                                  variant="outline"
                                  size="sm"
                                >
                                  <Eye className="w-3 h-3" />
                                </Button>
                                <Button
                                  onClick={() => openEditDialog(template)}
                                  variant="outline"
                                  size="sm"
                                >
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                <Button
                                  onClick={() => handleDelete(template.id)}
                                  variant="outline"
                                  size="sm"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p>No custom templates. Using default templates.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        </>
      )}

      {/* Template Edit Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate?.id ? 'Edit Email Template' : 'Create Email Template'}
            </DialogTitle>
          </DialogHeader>

          {editingTemplate && (
            <div className="space-y-6">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="template-product">Product</Label>
                  <Select
                    value={editingTemplate.productId}
                    onValueChange={(val) => setEditingTemplate({ ...editingTemplate, productId: val })}
                    disabled={!!editingTemplate.id}
                  >
                    <SelectTrigger id="template-product">
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="template-type">Template Type</Label>
                  <Select
                    value={editingTemplate.templateType}
                    onValueChange={(val) => {
                      const defaultTpl = getDefaultTemplate(val);
                      setEditingTemplate({
                        ...editingTemplate,
                        templateType: val,
                        subjectTemplate: editingTemplate.subjectTemplate || defaultTpl.subject,
                        bodyTemplate: editingTemplate.bodyTemplate || defaultTpl.body
                      });
                    }}
                    disabled={!!editingTemplate.id}
                  >
                    <SelectTrigger id="template-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {meta?.templateTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {getTemplateTypeName(type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between py-2">
                <Label htmlFor="template-enabled">Enabled</Label>
                <Switch
                  id="template-enabled"
                  checked={editingTemplate.enabled !== false}
                  onCheckedChange={(checked: boolean) =>
                    setEditingTemplate({ ...editingTemplate, enabled: checked })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject-template">Subject Template</Label>
                <Input
                  id="subject-template"
                  value={editingTemplate.subjectTemplate || ''}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, subjectTemplate: e.target.value })
                  }
                  placeholder="[Ticket #{{ticket_id}}] {{subject}}"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="body-template">Body Template (HTML)</Label>
                <Textarea
                  id="body-template"
                  value={editingTemplate.bodyTemplate || ''}
                  onChange={(e) =>
                    setEditingTemplate({ ...editingTemplate, bodyTemplate: e.target.value })
                  }
                  placeholder="Enter HTML template..."
                  rows={15}
                  className="font-mono text-sm"
                />
              </div>

              {editingTemplate.templateType && (
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const defaultTpl = getDefaultTemplate(editingTemplate.templateType!);
                      setEditingTemplate({
                        ...editingTemplate,
                        subjectTemplate: defaultTpl.subject,
                        bodyTemplate: defaultTpl.body
                      });
                    }}
                  >
                    <Code className="w-4 h-4 mr-2" />
                    Load Default Template
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateOrUpdate} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? 'Saving...' : 'Save Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Template Preview</DialogTitle>
          </DialogHeader>

          {previewTemplate && (
            <Tabs defaultValue="rendered" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="rendered">Rendered</TabsTrigger>
                <TabsTrigger value="source">Source</TabsTrigger>
              </TabsList>

              <TabsContent value="rendered" className="space-y-4">
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
                    {renderPreview(previewTemplate.subjectTemplate)}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Body</Label>
                  <ScrollArea className="h-[400px] border border-zinc-200 dark:border-zinc-700 rounded-lg">
                    <div
                      className="p-4"
                      dangerouslySetInnerHTML={{
                        __html: renderPreview(previewTemplate.bodyTemplate)
                      }}
                    />
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="source" className="space-y-4">
                <div className="space-y-2">
                  <Label>Subject Template</Label>
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 font-mono text-sm">
                    {previewTemplate.subjectTemplate}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Body Template</Label>
                  <ScrollArea className="h-[400px]">
                    <pre className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 font-mono text-xs overflow-x-auto">
                      {previewTemplate.bodyTemplate}
                    </pre>
                  </ScrollArea>
                </div>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button onClick={() => setShowPreviewDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Email Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this email template? This action cannot be undone.
              The system will fall back to the default template for this event type.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
