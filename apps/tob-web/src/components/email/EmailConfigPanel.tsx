import { useState, useEffect } from 'react';
import { useTranslation } from '@onfire/ui';
import {
  Button,
  Input,
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
  Switch,
  Label,
  Alert,
  AlertDescription,
  Skeleton,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from '@onfire/ui';
import {
  Mail,
  Send,
  Inbox,
  Settings,
  Key,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  Plus,
  Pencil,
  Trash2
} from 'lucide-react';
import {
  getEmailConfigMeta,
  listEmailConfigs,
  getEmailConfig,
  createEmailConfig,
  updateEmailConfig,
  deleteEmailConfig,
  testEmailConfig,
  generateWebhookSecret,
  type EmailConfig,
  type EmailConfigMeta
} from '../../api';

interface EmailConfigPanelProps {
  products: Array<{ id: string; name: string }>;
  onSuccess?: () => void;
}

export function EmailConfigPanel({ products, onSuccess }: EmailConfigPanelProps) {
  const { t } = useTranslation();
  const [meta, setMeta] = useState<EmailConfigMeta | null>(null);
  const [configs, setConfigs] = useState<EmailConfig[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [editingConfig, setEditingConfig] = useState<Partial<EmailConfig> | null>(null);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setInitialLoading(true);
    try {
      const [metaData, configsData] = await Promise.all([
        getEmailConfigMeta(),
        listEmailConfigs()
      ]);
      setMeta(metaData);
      setConfigs(configsData.data);
    } catch (err) {
      console.error('Failed to load email data:', err);
      setError('Failed to load email configuration');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleCreateOrUpdate = async () => {
    if (!editingConfig || !editingConfig.productId) {
      setError('Product is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const existingConfig = configs.find(c => c.productId === editingConfig.productId);

      if (existingConfig) {
        await updateEmailConfig(editingConfig.productId, editingConfig);
      } else {
        await createEmailConfig(editingConfig as any);
      }

      await loadData();
      setShowConfigDialog(false);
      setEditingConfig(null);
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (productId: string) => {
    if (!confirm('Delete this email configuration?')) return;

    try {
      await deleteEmailConfig(productId);
      await loadData();
      onSuccess?.();
    } catch (err: any) {
      alert(err.message || 'Delete failed');
    }
  };

  const handleTestEmail = async () => {
    if (!selectedProductId || !testEmail) return;

    setLoading(true);
    setTestResult(null);

    try {
      const result = await testEmailConfig(selectedProductId, testEmail);
      setTestResult({
        success: result.ok,
        message: result.ok
          ? `Test email sent successfully! Message ID: ${result.messageId}`
          : 'Test email failed'
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Test email failed'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateWebhookSecret = async (productId: string) => {
    if (!confirm('Generate a new webhook secret? The old secret will be invalidated.')) return;

    setLoading(true);

    try {
      const result = await generateWebhookSecret(productId);
      setWebhookSecret(result.webhookSecret);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to generate webhook secret');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  const openEditDialog = async (productId: string) => {
    try {
      const { data } = await getEmailConfig(productId);
      if (data) {
        setEditingConfig(data);
      } else {
        setEditingConfig({ productId });
      }
      setShowConfigDialog(true);
    } catch (err) {
      console.error('Failed to load email config:', err);
    }
  };

  const outboundProviders = meta?.providers.filter(p =>
    ['resend', 'sendgrid', 'mailgun', 'maileroo', 'smtp'].includes(p.id)
  ) || [];

  const inboundProviders = [
    { id: 'maileroo', name: 'Maileroo' },
    { id: 'sendgrid', name: 'SendGrid' },
    { id: 'mailgun', name: 'Mailgun' },
    { id: 'generic', name: 'Generic Webhook' }
  ];

  const requiresSmtp = editingConfig?.outboundProvider === 'smtp';
  const requiresApiKey = editingConfig?.outboundProvider && editingConfig.outboundProvider !== 'smtp';

  if (initialLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Email Configuration</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Configure email settings for inbound and outbound communication
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setSelectedProductId('');
              setShowTestDialog(true);
            }}
            variant="outline"
            size="sm"
          >
            <Send className="w-4 h-4 mr-2" />
            Test Email
          </Button>
          <Button
            onClick={() => {
              setEditingConfig({ productId: products[0]?.id });
              setShowConfigDialog(true);
            }}
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Configuration
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Configuration List */}
      <ScrollArea className="h-[600px]">
        <div className="space-y-4">
          {products.map((product) => {
            const config = configs.find(c => c.productId === product.id);

            return (
              <Card key={product.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{product.name}</CardTitle>
                      <CardDescription className="mt-1">Product ID: {product.id}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {config ? (
                        <>
                          <Button
                            onClick={() => openEditDialog(product.id)}
                            variant="outline"
                            size="sm"
                          >
                            <Pencil className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            onClick={() => handleDelete(product.id)}
                            variant="outline"
                            size="sm"
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            Delete
                          </Button>
                        </>
                      ) : (
                        <Button
                          onClick={() => {
                            setEditingConfig({ productId: product.id });
                            setShowConfigDialog(true);
                          }}
                          variant="outline"
                          size="sm"
                        >
                          <Settings className="w-3 h-3 mr-1" />
                          Configure
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {config ? (
                  <CardContent>
                    <div className="grid grid-cols-2 gap-6">
                      {/* Inbound Config */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Inbox className="w-4 h-4 text-zinc-500" />
                          <h4 className="font-medium text-zinc-900 dark:text-zinc-100">Inbound Email</h4>
                          <Badge variant={config.inboundEnabled ? 'default' : 'secondary'}>
                            {config.inboundEnabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </div>
                        {config.inboundEnabled && (
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="text-zinc-500">Provider:</span>
                              <span className="ml-2 text-zinc-900 dark:text-zinc-100">
                                {config.inboundProvider || 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="text-zinc-500">Address:</span>
                              <span className="ml-2 text-zinc-900 dark:text-zinc-100 font-mono text-xs">
                                {config.inboundAddress || 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="text-zinc-500">AI Filter:</span>
                              <span className="ml-2 text-zinc-900 dark:text-zinc-100">
                                {config.aiFilterEnabled ? `Enabled (${config.aiFilterStrictness})` : 'Disabled'}
                              </span>
                            </div>
                            <div className="pt-2">
                              <Button
                                onClick={() => handleGenerateWebhookSecret(product.id)}
                                variant="outline"
                                size="sm"
                                disabled={loading}
                              >
                                <Key className="w-3 h-3 mr-1" />
                                Generate Webhook Secret
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Outbound Config */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Send className="w-4 h-4 text-zinc-500" />
                          <h4 className="font-medium text-zinc-900 dark:text-zinc-100">Outbound Email</h4>
                          <Badge variant={config.outboundEnabled ? 'default' : 'secondary'}>
                            {config.outboundEnabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </div>
                        {config.outboundEnabled && (
                          <div className="space-y-2 text-sm">
                            <div>
                              <span className="text-zinc-500">Provider:</span>
                              <span className="ml-2 text-zinc-900 dark:text-zinc-100">
                                {config.outboundProvider || 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="text-zinc-500">Sender:</span>
                              <span className="ml-2 text-zinc-900 dark:text-zinc-100 font-mono text-xs">
                                {config.outboundSenderName || 'N/A'} &lt;{config.outboundSenderEmail || 'N/A'}&gt;
                              </span>
                            </div>
                            {config.outboundReplyTo && (
                              <div>
                                <span className="text-zinc-500">Reply-To:</span>
                                <span className="ml-2 text-zinc-900 dark:text-zinc-100 font-mono text-xs">
                                  {config.outboundReplyTo}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                ) : (
                  <CardContent>
                    <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                      <Mail className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No email configuration</p>
                      <p className="text-xs mt-1">Click Configure to set up email</p>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      {/* Configuration Dialog */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Configuration</DialogTitle>
          </DialogHeader>

          {editingConfig && (
            <div className="space-y-6">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Product Selection */}
              <div className="space-y-2">
                <Label htmlFor="product-select">Product</Label>
                <Select
                  value={editingConfig.productId}
                  onValueChange={(val) => setEditingConfig({ ...editingConfig, productId: val })}
                >
                  <SelectTrigger id="product-select">
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

              {/* Inbound Email Settings */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Inbound Email</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        Receive and process incoming support emails
                      </CardDescription>
                    </div>
                    <Switch
                      id="inbound-enabled"
                      checked={editingConfig.inboundEnabled || false}
                      onCheckedChange={(checked) =>
                        setEditingConfig({ ...editingConfig, inboundEnabled: checked })
                      }
                    />
                  </div>
                </CardHeader>

                {editingConfig.inboundEnabled && (
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="inbound-provider">Inbound Provider</Label>
                      <Select
                        value={editingConfig.inboundProvider || ''}
                        onValueChange={(val) =>
                          setEditingConfig({ ...editingConfig, inboundProvider: val })
                        }
                      >
                        <SelectTrigger id="inbound-provider">
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent>
                          {inboundProviders.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="inbound-address">Inbound Email Address</Label>
                      <Input
                        id="inbound-address"
                        type="email"
                        value={editingConfig.inboundAddress || ''}
                        onChange={(e) =>
                          setEditingConfig({ ...editingConfig, inboundAddress: e.target.value })
                        }
                        placeholder="support@yourcompany.com"
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="ai-filter">AI Spam Filter</Label>
                        <p className="text-xs text-muted-foreground">
                          Use AI to filter spam and non-support emails
                        </p>
                      </div>
                      <Switch
                        id="ai-filter"
                        checked={editingConfig.aiFilterEnabled !== false}
                        onCheckedChange={(checked) =>
                          setEditingConfig({ ...editingConfig, aiFilterEnabled: checked })
                        }
                      />
                    </div>

                    {editingConfig.aiFilterEnabled !== false && (
                      <div className="space-y-2">
                        <Label htmlFor="filter-strictness">Filter Strictness</Label>
                        <Select
                          value={editingConfig.aiFilterStrictness || 'medium'}
                          onValueChange={(val: any) =>
                            setEditingConfig({ ...editingConfig, aiFilterStrictness: val })
                          }
                        >
                          <SelectTrigger id="filter-strictness">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low - More permissive</SelectItem>
                            <SelectItem value="medium">Medium - Balanced</SelectItem>
                            <SelectItem value="high">High - More strict</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>

              {/* Outbound Email Settings */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Outbound Email</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        Send email notifications to customers
                      </CardDescription>
                    </div>
                    <Switch
                      id="outbound-enabled"
                      checked={editingConfig.outboundEnabled || false}
                      onCheckedChange={(checked) =>
                        setEditingConfig({ ...editingConfig, outboundEnabled: checked })
                      }
                    />
                  </div>
                </CardHeader>

                {editingConfig.outboundEnabled && (
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="outbound-provider">Outbound Provider</Label>
                      <Select
                        value={editingConfig.outboundProvider || ''}
                        onValueChange={(val: any) =>
                          setEditingConfig({ ...editingConfig, outboundProvider: val })
                        }
                      >
                        <SelectTrigger id="outbound-provider">
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent>
                          {outboundProviders.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {requiresApiKey && (
                      <div className="space-y-2">
                        <Label htmlFor="api-key">API Key</Label>
                        <Input
                          id="api-key"
                          type="password"
                          value={editingConfig.outboundApiKey || ''}
                          onChange={(e) =>
                            setEditingConfig({ ...editingConfig, outboundApiKey: e.target.value })
                          }
                          placeholder="Enter API key"
                        />
                      </div>
                    )}

                    {requiresSmtp && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="smtp-host">SMTP Host</Label>
                            <Input
                              id="smtp-host"
                              value={editingConfig.outboundSmtpHost || ''}
                              onChange={(e) =>
                                setEditingConfig({ ...editingConfig, outboundSmtpHost: e.target.value })
                              }
                              placeholder="smtp.example.com"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="smtp-port">SMTP Port</Label>
                            <Input
                              id="smtp-port"
                              type="number"
                              value={editingConfig.outboundSmtpPort || ''}
                              onChange={(e) =>
                                setEditingConfig({ ...editingConfig, outboundSmtpPort: parseInt(e.target.value) || null })
                              }
                              placeholder="587"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="smtp-user">SMTP User</Label>
                          <Input
                            id="smtp-user"
                            value={editingConfig.outboundSmtpUser || ''}
                            onChange={(e) =>
                              setEditingConfig({ ...editingConfig, outboundSmtpUser: e.target.value })
                            }
                            placeholder="user@example.com"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="smtp-password">SMTP Password</Label>
                          <Input
                            id="smtp-password"
                            type="password"
                            value={editingConfig.outboundSmtpPass || ''}
                            onChange={(e) =>
                              setEditingConfig({ ...editingConfig, outboundSmtpPass: e.target.value })
                            }
                            placeholder="Enter password"
                          />
                        </div>
                      </>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="sender-name">Sender Name</Label>
                        <Input
                          id="sender-name"
                          value={editingConfig.outboundSenderName || ''}
                          onChange={(e) =>
                            setEditingConfig({ ...editingConfig, outboundSenderName: e.target.value })
                          }
                          placeholder="Support Team"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sender-email">Sender Email</Label>
                        <Input
                          id="sender-email"
                          type="email"
                          value={editingConfig.outboundSenderEmail || ''}
                          onChange={(e) =>
                            setEditingConfig({ ...editingConfig, outboundSenderEmail: e.target.value })
                          }
                          placeholder="support@yourcompany.com"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reply-to">Reply-To Email (optional)</Label>
                      <Input
                        id="reply-to"
                        type="email"
                        value={editingConfig.outboundReplyTo || ''}
                        onChange={(e) =>
                          setEditingConfig({ ...editingConfig, outboundReplyTo: e.target.value })
                        }
                        placeholder="replies@yourcompany.com"
                      />
                    </div>
                  </CardContent>
                )}
              </Card>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigDialog(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleCreateOrUpdate} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Email Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test Email Configuration</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test-product">Product</Label>
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger id="test-product">
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products.filter(p => configs.find(c => c.productId === p.id)?.outboundEnabled).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="test-email">Test Email Address</Label>
              <Input
                id="test-email"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="your-email@example.com"
              />
            </div>

            {testResult && (
              <Alert variant={testResult.success ? 'success' : 'destructive'}>
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <AlertDescription>{testResult.message}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTestDialog(false)}>
              Close
            </Button>
            <Button
              onClick={handleTestEmail}
              disabled={loading || !selectedProductId || !testEmail}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Test Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Webhook Secret Display Dialog */}
      {webhookSecret && (
        <Dialog open={!!webhookSecret} onOpenChange={() => setWebhookSecret(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Webhook Secret Generated</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <Alert variant="warning">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Save this webhook secret securely. It will not be shown again.
                </AlertDescription>
              </Alert>

              <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg font-mono text-sm break-all border">
                {webhookSecret}
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => copyToClipboard(webhookSecret)}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy to Clipboard
              </Button>
            </div>

            <DialogFooter>
              <Button onClick={() => setWebhookSecret(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
