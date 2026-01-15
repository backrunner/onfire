import { useEffect, useState } from 'react';
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Badge,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@onfire/ui';
import {
  Bell,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Send,
  AlertCircle,
  CheckCircle2,
  Mail,
  MessageSquare,
  Smartphone,
  Check,
  Square
} from 'lucide-react';
import {
  getNotificationChannelMeta,
  listNotificationChannels,
  createNotificationChannel,
  updateNotificationChannel,
  deleteNotificationChannel,
  testNotificationChannel,
  listNotificationLogs,
  adminProducts,
  type NotificationChannel,
  type NotificationChannelMeta,
  type NotificationChannelType,
  type NotificationTriggerEvent,
  type NotificationLog
} from '../api';

const CHANNEL_ICONS: Record<NotificationChannelType, React.ReactNode> = {
  email: <Mail className="h-4 w-4" />,
  pushdeer: <Smartphone className="h-4 w-4" />,
  bark: <Smartphone className="h-4 w-4" />,
  ntfy: <Bell className="h-4 w-4" />,
  telegram: <MessageSquare className="h-4 w-4" />,
  discord: <MessageSquare className="h-4 w-4" />
};

interface NotificationConfigPanelProps {
  canManage: boolean;
}

export function NotificationConfigPanel({ canManage }: NotificationConfigPanelProps) {
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<NotificationChannelMeta | null>(null);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [showLogs, setShowLogs] = useState(false);

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<NotificationChannel | null>(null);
  const [testingChannelId, setTestingChannelId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Form states
  const [formChannelType, setFormChannelType] = useState<NotificationChannelType>('email');
  const [formName, setFormName] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formConfig, setFormConfig] = useState<Record<string, string>>({});
  const [formTriggerEvents, setFormTriggerEvents] = useState<NotificationTriggerEvent[]>([
    'ticket_assigned',
    'ticket_reassigned',
    'ticket_escalated'
  ]);
  const [formError, setFormError] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const [metaRes, productsRes] = await Promise.all([
        getNotificationChannelMeta(),
        adminProducts()
      ]);
      setMeta(metaRes);
      setProducts(productsRes.data || []);

      if (selectedProductId) {
        const channelsRes = await listNotificationChannels(selectedProductId);
        setChannels(channelsRes.data || []);
      }
    } catch (err) {
      console.error('Failed to load notification config:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadChannels = async () => {
    if (!selectedProductId) {
      setChannels([]);
      return;
    }
    setLoading(true);
    try {
      const res = await listNotificationChannels(selectedProductId);
      setChannels(res.data || []);
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    if (!selectedProductId) return;
    try {
      const res = await listNotificationLogs({ productId: selectedProductId, limit: 50 });
      setLogs(res.data || []);
    } catch (err) {
      console.error('Failed to load logs:', err);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    loadChannels();
    if (showLogs) loadLogs();
  }, [selectedProductId]);

  const resetForm = () => {
    setFormChannelType('email');
    setFormName('');
    setFormEnabled(true);
    setFormConfig({});
    setFormTriggerEvents(['ticket_assigned', 'ticket_reassigned', 'ticket_escalated']);
    setFormError('');
  };

  const openCreateDialog = () => {
    resetForm();
    setShowCreateDialog(true);
  };

  const openEditDialog = (channel: NotificationChannel) => {
    setEditingChannel(channel);
    setFormChannelType(channel.channelType);
    setFormName(channel.name);
    setFormEnabled(channel.enabled);
    try {
      setFormConfig(JSON.parse(channel.config));
    } catch {
      setFormConfig({});
    }
    setFormTriggerEvents(channel.triggerEvents);
    setFormError('');
  };

  const handleCreate = async () => {
    if (!selectedProductId) {
      setFormError('Please select a product first');
      return;
    }
    if (!formName.trim()) {
      setFormError('Name is required');
      return;
    }
    if (formTriggerEvents.length === 0) {
      setFormError('At least one trigger event is required');
      return;
    }

    setLoading(true);
    try {
      await createNotificationChannel({
        productId: selectedProductId,
        channelType: formChannelType,
        name: formName.trim(),
        enabled: formEnabled,
        config: formConfig,
        triggerEvents: formTriggerEvents
      });
      setShowCreateDialog(false);
      resetForm();
      await loadChannels();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create channel');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingChannel) return;
    if (!formName.trim()) {
      setFormError('Name is required');
      return;
    }
    if (formTriggerEvents.length === 0) {
      setFormError('At least one trigger event is required');
      return;
    }

    setLoading(true);
    try {
      await updateNotificationChannel(editingChannel.id, {
        name: formName.trim(),
        enabled: formEnabled,
        config: formConfig,
        triggerEvents: formTriggerEvents
      });
      setEditingChannel(null);
      resetForm();
      await loadChannels();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update channel');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setLoading(true);
    try {
      await deleteNotificationChannel(confirmDelete.id);
      setConfirmDelete(null);
      await loadChannels();
    } catch (err) {
      console.error('Failed to delete channel:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async (channelId: string) => {
    setTestingChannelId(channelId);
    setTestResult(null);
    try {
      const res = await testNotificationChannel(channelId);
      setTestResult({ success: res.ok, message: res.ok ? 'Test notification sent successfully' : 'Test failed' });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Test failed' });
    } finally {
      setTestingChannelId(null);
    }
  };

  const toggleTriggerEvent = (event: NotificationTriggerEvent) => {
    setFormTriggerEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const getChannelTypeMeta = (type: NotificationChannelType) => {
    return meta?.channelTypes.find((ct) => ct.id === type);
  };

  if (!canManage) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
        <AlertCircle className="mr-2 h-4 w-4" />
        You don't have permission to manage notification channels
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Select value={selectedProductId} onValueChange={setSelectedProductId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select a product" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowLogs(!showLogs);
              if (!showLogs) loadLogs();
            }}
          >
            {showLogs ? 'Hide Logs' : 'Show Logs'}
          </Button>
          <Button size="sm" onClick={openCreateDialog} disabled={!selectedProductId}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Channel
          </Button>
        </div>
      </div>

      {!selectedProductId ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Bell className="mb-3 h-8 w-8" />
          <p className="text-sm">Select a product to configure notification channels</p>
        </div>
      ) : (
        <>
          {/* Channels List */}
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-medium">Notification Channels</h3>
              <p className="text-xs text-muted-foreground">
                Configure how agents receive notifications when tickets are assigned
              </p>
            </div>
            <ScrollArea className="h-80">
              {channels.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Bell className="mb-3 h-6 w-6" />
                  <p className="text-sm">No notification channels configured</p>
                  <p className="text-xs">Click "Add Channel" to create one</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {channels.map((channel) => (
                    <div
                      key={channel.id}
                      className="flex items-center justify-between px-4 py-3 hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                          {CHANNEL_ICONS[channel.channelType]}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{channel.name}</span>
                            <Badge variant={channel.enabled ? 'default' : 'secondary'}>
                              {channel.enabled ? 'Enabled' : 'Disabled'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="capitalize">{channel.channelType}</span>
                            <span>·</span>
                            <span>
                              {channel.triggerEvents.length} trigger
                              {channel.triggerEvents.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTest(channel.id)}
                          disabled={testingChannelId === channel.id}
                        >
                          <Send className={`h-3 w-3 ${testingChannelId === channel.id ? 'animate-pulse' : ''}`} />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(channel)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirmDelete(channel)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Test Result */}
          {testResult && (
            <div
              className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
                testResult.success
                  ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300'
                  : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {testResult.message}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-6 px-2"
                onClick={() => setTestResult(null)}
              >
                Dismiss
              </Button>
            </div>
          )}

          {/* Logs */}
          {showLogs && (
            <div className="rounded-lg border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h3 className="text-sm font-medium">Recent Notification Logs</h3>
              </div>
              <ScrollArea className="h-60">
                {logs.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    No logs found
                  </div>
                ) : (
                  <div className="divide-y divide-border text-sm">
                    {logs.map((log) => (
                      <div key={log.id} className="flex items-center justify-between px-4 py-2">
                        <div className="flex items-center gap-3">
                          <Badge
                            variant={
                              log.status === 'sent'
                                ? 'default'
                                : log.status === 'failed'
                                ? 'destructive'
                                : 'secondary'
                            }
                          >
                            {log.status}
                          </Badge>
                          <span className="capitalize">{log.channelType}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">{log.triggerEvent.replace('ticket_', '')}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="font-mono text-xs text-muted-foreground">#{log.ticketId.slice(0, 8)}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </>
      )}

      {/* Create/Edit Dialog */}
      <Dialog
        open={showCreateDialog || !!editingChannel}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setEditingChannel(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingChannel ? 'Edit Channel' : 'Add Notification Channel'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Channel Type (only for create) */}
            {!editingChannel && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Channel Type</label>
                <Select
                  value={formChannelType}
                  onValueChange={(v) => {
                    setFormChannelType(v as NotificationChannelType);
                    setFormConfig({});
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta?.channelTypes.map((ct) => (
                      <SelectItem key={ct.id} value={ct.id}>
                        <div className="flex items-center gap-2">
                          {CHANNEL_ICONS[ct.id as NotificationChannelType]}
                          <span>{ct.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {getChannelTypeMeta(formChannelType)?.description}
                </p>
              </div>
            )}

            {/* Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="e.g., Team Notifications"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            {/* Enabled */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">Enabled</label>
                <p className="text-xs text-muted-foreground">Enable or disable this channel</p>
              </div>
              <Button
                size="sm"
                variant={formEnabled ? 'default' : 'outline'}
                onClick={() => setFormEnabled(!formEnabled)}
              >
                {formEnabled ? 'Enabled' : 'Disabled'}
              </Button>
            </div>

            {/* Config Fields */}
            {getChannelTypeMeta(formChannelType)?.configFields.map((field) => (
              <div key={field.key} className="space-y-2">
                <label className="text-sm font-medium">
                  {field.label}
                  {field.required && <span className="text-destructive">*</span>}
                </label>
                <Input
                  type={field.type === 'password' ? 'password' : 'text'}
                  placeholder={field.placeholder}
                  value={formConfig[field.key] || ''}
                  onChange={(e) => setFormConfig({ ...formConfig, [field.key]: e.target.value })}
                />
              </div>
            ))}

            {/* Trigger Events */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Trigger Events</label>
              <p className="text-xs text-muted-foreground">
                Select when to send notifications through this channel
              </p>
              <div className="space-y-2">
                {meta?.triggerEvents.map((event) => {
                  const isChecked = formTriggerEvents.includes(event.id as NotificationTriggerEvent);
                  return (
                    <button
                      key={event.id}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted/50"
                      onClick={() => toggleTriggerEvent(event.id as NotificationTriggerEvent)}
                    >
                      <div className={`flex h-4 w-4 items-center justify-center rounded border ${isChecked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'}`}>
                        {isChecked && <Check className="h-3 w-3" />}
                      </div>
                      <span>{event.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Error */}
            {formError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {formError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setEditingChannel(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button onClick={editingChannel ? handleUpdate : handleCreate} disabled={loading}>
              {editingChannel ? 'Save Changes' : 'Create Channel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Channel</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete the channel "{confirmDelete?.name}"? This action cannot be
            undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
