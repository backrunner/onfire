import { useEffect, useState } from 'react';
import {
  Button,
  Input,
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
  ScrollArea
} from '@onfire/ui';
import {
  Bot,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Zap,
  Eye,
  EyeOff,
  AlertCircle
} from 'lucide-react';
import {
  getAIConfigMeta,
  listAIConfigs,
  createAIConfig,
  updateAIConfig,
  deleteAIConfig,
  testAIConfig,
  type AIConfig,
  type AIConfigMeta
} from '../../api';

interface AIConfigPanelProps {
  onRefresh?: () => void;
}

const EmptyState = ({ text }: { text: string }) => (
  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
    <div className="mb-2 rounded-full bg-muted p-3">
      <Bot className="h-5 w-5" />
    </div>
    <span className="text-sm">{text}</span>
  </div>
);

export function AIConfigPanel({ onRefresh }: AIConfigPanelProps) {
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<AIConfigMeta | null>(null);
  const [configs, setConfigs] = useState<AIConfig[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AIConfig | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [confirmDelete, setConfirmDelete] = useState<AIConfig | null>(null);

  // Form state
  const [formTaskType, setFormTaskType] = useState('');
  const [formProvider, setFormProvider] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formApiKey, setFormApiKey] = useState('');
  const [formBaseUrl, setFormBaseUrl] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formCustomModel, setFormCustomModel] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const [metaRes, configsRes] = await Promise.all([getAIConfigMeta(), listAIConfigs()]);
      setMeta(metaRes);
      setConfigs(configsRes);
    } catch (err) {
      console.error('Failed to load AI config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const resetForm = () => {
    setFormTaskType('');
    setFormProvider('');
    setFormModel('');
    setFormApiKey('');
    setFormBaseUrl('');
    setFormEnabled(true);
    setFormCustomModel('');
  };

  const getAvailableTaskTypes = () => {
    if (!meta) return [];
    const usedTypes = new Set(configs.map((c) => c.taskType));
    return meta.taskTypes.filter((t) => !usedTypes.has(t.id));
  };

  const getProviderModels = (providerId: string) => {
    if (!meta) return [];
    const provider = meta.providers.find((p) => p.id === providerId);
    return provider?.models || [];
  };

  const getProviderBaseUrl = (providerId: string) => {
    if (!meta) return undefined;
    const provider = meta.providers.find((p) => p.id === providerId);
    return provider?.baseUrl;
  };

  const handleCreate = async () => {
    if (!formTaskType || !formProvider || (!formModel && !formCustomModel) || !formApiKey) return;
    setLoading(true);
    try {
      await createAIConfig({
        taskType: formTaskType,
        provider: formProvider,
        model: formCustomModel || formModel,
        apiKey: formApiKey,
        baseUrl: formBaseUrl || undefined,
        enabled: formEnabled
      });
      setShowCreate(false);
      resetForm();
      await refresh();
      onRefresh?.();
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingConfig) return;
    setLoading(true);
    try {
      await updateAIConfig(editingConfig.id, {
        provider: formProvider || undefined,
        model: formCustomModel || formModel || undefined,
        apiKey: formApiKey || undefined,
        baseUrl: formBaseUrl,
        enabled: formEnabled
      });
      setEditingConfig(null);
      resetForm();
      await refresh();
      onRefresh?.();
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    try {
      await deleteAIConfig(id);
      setConfirmDelete(null);
      await refresh();
      onRefresh?.();
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestResult(null);
    try {
      const result = await testAIConfig(id);
      setTestResult({ id, ...result });
    } catch {
      setTestResult({ id, success: false, message: 'Connection test failed' });
    }
  };

  const openEdit = (config: AIConfig) => {
    setEditingConfig(config);
    setFormProvider(config.provider);
    setFormModel(config.model);
    setFormApiKey('');
    setFormBaseUrl(config.baseUrl || '');
    setFormEnabled(config.enabled);
    setFormCustomModel('');
    // Check if model is in preset list
    const models = getProviderModels(config.provider);
    if (!models.includes(config.model)) {
      setFormCustomModel(config.model);
      setFormModel('');
    }
  };

  const getTaskTypeName = (id: string) => {
    return meta?.taskTypes.find((t) => t.id === id)?.name || id;
  };

  const getProviderName = (id: string) => {
    return meta?.providers.find((p) => p.id === id)?.name || id;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">AI 配置</h3>
          <p className="text-xs text-muted-foreground">配置不同任务类型使用的 AI 模型</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={refresh} loading={loading}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            刷新
          </Button>
          <Button
            size="sm"
            onClick={() => {
              resetForm();
              setShowCreate(true);
            }}
            disabled={getAvailableTaskTypes().length === 0}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            新建配置
          </Button>
        </div>
      </div>

      {/* Config List */}
      <div className="rounded-lg border border-border bg-card">
        <ScrollArea className="h-96">
          <div className="divide-y divide-border">
            {configs.length === 0 ? (
              <EmptyState text="暂无 AI 配置" />
            ) : (
              configs.map((config) => (
                <div key={config.id} className="p-4 hover:bg-muted/50">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{getTaskTypeName(config.taskType)}</span>
                        <Badge variant={config.enabled ? 'success' : 'secondary'} size="sm">
                          {config.enabled ? '启用' : '停用'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{getProviderName(config.provider)}</span>
                        <span>·</span>
                        <span>{config.model}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">API Key:</span>
                        <code className="rounded bg-muted px-1.5 py-0.5">
                          {showApiKey[config.id] ? config.apiKey : config.apiKey}
                        </code>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-5 px-1.5"
                          onClick={() =>
                            setShowApiKey((prev) => ({ ...prev, [config.id]: !prev[config.id] }))
                          }
                        >
                          {showApiKey[config.id] ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                      {config.baseUrl && (
                        <div className="text-xs text-muted-foreground">
                          Base URL: {config.baseUrl}
                        </div>
                      )}
                      {testResult?.id === config.id && (
                        <div
                          className={`mt-2 flex items-center gap-1.5 text-xs ${
                            testResult.success ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {testResult.success ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5" />
                          )}
                          {testResult.message}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTest(config.id)}
                        title="测试连接"
                      >
                        <Zap className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(config)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmDelete(config)}>
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

      {/* Task Type Info */}
      {meta && (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
          <h4 className="mb-2 text-xs font-medium text-muted-foreground">任务类型说明</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {meta.taskTypes.map((t) => (
              <div key={t.id} className="text-xs">
                <span className="font-medium">{t.name}</span>
                <span className="ml-2 text-muted-foreground">{t.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新建 AI 配置</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">任务类型</label>
              <Select value={formTaskType} onValueChange={setFormTaskType}>
                <SelectTrigger>
                  <SelectValue placeholder="选择任务类型" />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableTaskTypes().map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">AI 提供商</label>
              <Select
                value={formProvider}
                onValueChange={(v) => {
                  setFormProvider(v);
                  setFormModel('');
                  setFormCustomModel('');
                  const baseUrl = getProviderBaseUrl(v);
                  if (baseUrl) setFormBaseUrl(baseUrl);
                  else setFormBaseUrl('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择提供商" />
                </SelectTrigger>
                <SelectContent>
                  {meta?.providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formProvider && (
              <div className="space-y-2">
                <label className="text-sm font-medium">模型</label>
                <Select value={formModel} onValueChange={(v) => setFormModel(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {getProviderModels(formProvider).map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="或输入自定义模型名称"
                  value={formCustomModel}
                  onChange={(e) => {
                    setFormCustomModel(e.target.value);
                    if (e.target.value) setFormModel('');
                  }}
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">API Key</label>
              <Input
                type="password"
                placeholder="输入 API Key"
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Base URL (可选)</label>
              <Input
                placeholder="自定义 API 端点"
                value={formBaseUrl}
                onChange={(e) => setFormBaseUrl(e.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formEnabled}
                onChange={(e) => setFormEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              启用配置
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button
              onClick={handleCreate}
              loading={loading}
              disabled={!formTaskType || !formProvider || (!formModel && !formCustomModel) || !formApiKey}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={Boolean(editingConfig)} onOpenChange={() => setEditingConfig(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>编辑 AI 配置 - {editingConfig && getTaskTypeName(editingConfig.taskType)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">AI 提供商</label>
              <Select
                value={formProvider}
                onValueChange={(v) => {
                  setFormProvider(v);
                  setFormModel('');
                  setFormCustomModel('');
                  const baseUrl = getProviderBaseUrl(v);
                  if (baseUrl) setFormBaseUrl(baseUrl);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择提供商" />
                </SelectTrigger>
                <SelectContent>
                  {meta?.providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formProvider && (
              <div className="space-y-2">
                <label className="text-sm font-medium">模型</label>
                <Select value={formModel} onValueChange={(v) => setFormModel(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {getProviderModels(formProvider).map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="或输入自定义模型名称"
                  value={formCustomModel}
                  onChange={(e) => {
                    setFormCustomModel(e.target.value);
                    if (e.target.value) setFormModel('');
                  }}
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">API Key (留空保持不变)</label>
              <Input
                type="password"
                placeholder="输入新的 API Key"
                value={formApiKey}
                onChange={(e) => setFormApiKey(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Base URL (可选)</label>
              <Input
                placeholder="自定义 API 端点"
                value={formBaseUrl}
                onChange={(e) => setFormBaseUrl(e.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formEnabled}
                onChange={(e) => setFormEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              启用配置
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingConfig(null)}>
              取消
            </Button>
            <Button onClick={handleUpdate} loading={loading}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            确定删除 <strong>{confirmDelete && getTaskTypeName(confirmDelete.taskType)}</strong> 的 AI 配置？
            此操作不可撤销。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              取消
            </Button>
            <Button
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => confirmDelete && handleDelete(confirmDelete.id)}
              loading={loading}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
