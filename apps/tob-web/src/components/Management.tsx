import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Input,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Badge,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@onfire/ui';
import {
  ShieldCheck,
  Users,
  Building2,
  LayoutList,
  Bot,
  RefreshCw,
  Pencil,
  Trash2,
  KeyRound,
  Copy,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Settings2,
  Sparkles,
  BookOpen
} from 'lucide-react';
import {
  adminTenants,
  adminProducts,
  adminTeams,
  adminTemplates,
  adminUsers,
  adminCustomers,
  adminAgents,
  adminProductKeys,
  adminCategoryRoutes,
  createTenant,
  createProduct,
  createProductKey,
  rotateProductKey,
  revokeProductKey,
  createTeam,
  createTemplate,
  updateTenant,
  updateProduct,
  updateTeam,
  updateTemplate,
  updateAgent,
  updateUser,
  createCategoryRoute,
  updateCategoryRoute,
  deleteCategoryRoute,
  deleteTenant,
  deleteProduct,
  deleteTeam,
  deleteTemplate
} from '../api';
import { Role } from '@onfire/shared';
import { FormBuilder, FormField } from './FormBuilder';
import { AIConfigPanel } from './ai/AIConfigPanel';
import { KnowledgeBaseDialog } from './knowledge/KnowledgeBaseDialog';

const NoAccess = ({ reason }: { reason: string }) => (
  <div className="flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
    <AlertCircle className="mr-2 h-4 w-4" />
    {reason}
  </div>
);

const EmptyState = ({ text }: { text: string }) => (
  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
    <div className="mb-2 rounded-full bg-muted p-3">
      <Settings2 className="h-5 w-5" />
    </div>
    <span className="text-sm">{text}</span>
  </div>
);

const ErrorText = ({ text }: { text?: string }) =>
  text ? (
    <div className="flex items-center gap-1.5 text-xs text-destructive">
      <AlertCircle className="h-3 w-3" />
      {text}
    </div>
  ) : null;

interface PaginationControlsProps {
  page: number;
  total: number;
  pageSize: number;
  onPrev: () => void;
  onNext: () => void;
}

const PaginationControls = ({ page, total, pageSize, onPrev, onNext }: PaginationControlsProps) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
      <span>
        共 {total} 条 · 第 {page} / {pages} 页
      </span>
      <div className="flex gap-1">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={onPrev}>
          <ChevronLeft className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={onNext}>
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};

export function Management({
  canManageTenant,
  canManageProduct,
  canManageTeam,
  canManageTemplate,
  canManageUser
}: {
  canManageTenant: boolean;
  canManageProduct: boolean;
  canManageTeam: boolean;
  canManageTemplate: boolean;
  canManageUser: boolean;
}) {
  const canSeeTenants = canManageTenant;
  const canSeeProducts = canManageProduct || canManageTemplate;
  const canSeeTeams = canManageTeam;
  const canSeeTemplates = canManageTemplate;
  const canSeeUsers = canManageUser;
  const canSeeAI = canManageTenant; // SuperAdmin only

  const [loading, setLoading] = useState(false);
  const [tenants, setTenants] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [productKeys, setProductKeys] = useState<any[]>([]);
  const [categoryRoutes, setCategoryRoutes] = useState<any[]>([]);

  // Form states
  const [apiKeyProductId, setApiKeyProductId] = useState('');
  const [apiKeyName, setApiKeyName] = useState('');
  const [issuedApiKey, setIssuedApiKey] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState('');
  const [editingTenant, setEditingTenant] = useState<any | null>(null);
  const [productName, setProductName] = useState('');
  const [productSla, setProductSla] = useState<{
    highAccept?: string;
    highReply?: string;
    mediumAccept?: string;
    mediumReply?: string;
    lowAccept?: string;
    lowReply?: string;
  }>({});
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [editingProductTeams, setEditingProductTeams] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamReassign, setTeamReassign] = useState(true);
  const [editingTeam, setEditingTeam] = useState<any | null>(null);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateProductId, setTemplateProductId] = useState('');
  const [templateCategories, setTemplateCategories] = useState('[]');
  const [templateSchema, setTemplateSchema] = useState('{}');
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'tenant' | 'product' | 'team' | 'template';
    id: string;
    name: string;
  } | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pageSize, setPageSize] = useState(10);
  const [tenantPage, setTenantPage] = useState(1);
  const [productPage, setProductPage] = useState(1);
  const [teamPage, setTeamPage] = useState(1);
  const [templatePage, setTemplatePage] = useState(1);
  const [templateFields, setTemplateFields] = useState<FormField[]>([]);
  const [editingAgent, setEditingAgent] = useState<any | null>(null);
  const [agentTeamsInput, setAgentTeamsInput] = useState('');
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [userRoleDraft, setUserRoleDraft] = useState<Role | ''>('');
  const [userDisplayDraft, setUserDisplayDraft] = useState('');
  const [catProductId, setCatProductId] = useState('');
  const [catCategory, setCatCategory] = useState('');
  const [catSubcategory, setCatSubcategory] = useState('');
  const [catTeamId, setCatTeamId] = useState('');
  const [editingCategoryRoute, setEditingCategoryRoute] = useState<any | null>(null);
  const [editCatTeamId, setEditCatTeamId] = useState('');
  const [knowledgeProduct, setKnowledgeProduct] = useState<{ id: string; name: string } | null>(null);

  // Search states
  const [tenantSearch, setTenantSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  const productOptions = useMemo(
    () => products.map((p) => ({ label: p.name ?? p.id, value: p.id })),
    [products]
  );

  const paged = <T,>(items: T[], page: number) => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  };

  const parseMinutes = (v?: string | number | null) => {
    if (v === undefined || v === null || v === '') return undefined;
    const num = Number(v);
    return Number.isFinite(num) ? num : undefined;
  };

  const toSlaPayload = (input: {
    highAccept?: string | number;
    highReply?: string | number;
    mediumAccept?: string | number;
    mediumReply?: string | number;
    lowAccept?: string | number;
    lowReply?: string | number;
  }) => ({
    highAccept: parseMinutes(input.highAccept),
    highReply: parseMinutes(input.highReply),
    mediumAccept: parseMinutes(input.mediumAccept),
    mediumReply: parseMinutes(input.mediumReply),
    lowAccept: parseMinutes(input.lowAccept),
    lowReply: parseMinutes(input.lowReply)
  });

  const resetProductSla = () => setProductSla({});

  const refresh = async () => {
    setLoading(true);
    try {
      if (canManageTenant) setTenants((await adminTenants()).data ?? []);
      if (canManageProduct) setProducts((await adminProducts()).data ?? []);
      if (canManageProduct) setProductKeys((await adminProductKeys()).data ?? []);
      if (canManageTeam) setTeams((await adminTeams()).data ?? []);
      if (canManageTemplate) setTemplates((await adminTemplates()).data ?? []);
      if (canManageUser) setUsers((await adminUsers()).data ?? []);
      if (canManageUser) setAgents((await adminAgents()).data ?? []);
      setCategoryRoutes((await adminCategoryRoutes()).data ?? []);
      setCustomers((await adminCustomers()).data ?? []);
      setTenantPage(1);
      setProductPage(1);
      setTeamPage(1);
      setTemplatePage(1);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setError = (key: string, msg?: string) => {
    setErrors((prev) => ({ ...prev, [key]: msg ?? '' }));
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      /* ignore */
    }
  };

  // Filter helpers
  const filteredTenants = tenants.filter((t) =>
    tenantSearch ? (t.name ?? '').toLowerCase().includes(tenantSearch.toLowerCase()) : true
  );
  const filteredProducts = products.filter((p) =>
    productSearch ? (p.name ?? '').toLowerCase().includes(productSearch.toLowerCase()) : true
  );
  const filteredTeams = teams.filter((t) =>
    teamSearch ? (t.name ?? '').toLowerCase().includes(teamSearch.toLowerCase()) : true
  );
  const filteredTemplates = templates.filter((t) =>
    templateSearch ? (t.title ?? '').toLowerCase().includes(templateSearch.toLowerCase()) : true
  );
  const filteredUsers = users.filter((u) =>
    userSearch ? (u.email ?? '').toLowerCase().includes(userSearch.toLowerCase()) : true
  );
  const filteredAgents = agents.filter((a) =>
    agentSearch ? (a.email ?? '').toLowerCase().includes(agentSearch.toLowerCase()) : true
  );
  const filteredCustomers = customers.filter((c) =>
    customerSearch ? (c.email ?? '').toLowerCase().includes(customerSearch.toLowerCase()) : true
  );

  // Determine default tab
  const getDefaultTab = () => {
    if (canSeeTenants) return 'tenants';
    if (canSeeProducts) return 'products';
    if (canSeeTeams) return 'teams';
    if (canSeeTemplates) return 'templates';
    if (canSeeUsers) return 'users';
    return 'tenants';
  };

  return (
    <div className="h-full p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">系统管理</h1>
          <p className="text-sm text-muted-foreground">管理租户、产品、团队、模板和用户</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 条/页</SelectItem>
              <SelectItem value="20">20 条/页</SelectItem>
              <SelectItem value="50">50 条/页</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={refresh} loading={loading}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            刷新
          </Button>
        </div>
      </div>

      <Tabs defaultValue={getDefaultTab()} className="h-[calc(100%-60px)]">
        <TabsList>
          {canSeeTenants && (
            <TabsTrigger value="tenants">
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
              租户
            </TabsTrigger>
          )}
          {canSeeProducts && (
            <TabsTrigger value="products">
              <LayoutList className="mr-1.5 h-3.5 w-3.5" />
              产品
            </TabsTrigger>
          )}
          {canSeeTeams && (
            <TabsTrigger value="teams">
              <Users className="mr-1.5 h-3.5 w-3.5" />
              团队
            </TabsTrigger>
          )}
          {canSeeTemplates && (
            <TabsTrigger value="templates">
              <Bot className="mr-1.5 h-3.5 w-3.5" />
              模板
            </TabsTrigger>
          )}
          {canSeeUsers && (
            <TabsTrigger value="users">
              <Building2 className="mr-1.5 h-3.5 w-3.5" />
              用户
            </TabsTrigger>
          )}
          {canSeeAI && (
            <TabsTrigger value="ai">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              AI 配置
            </TabsTrigger>
          )}
        </TabsList>

        {/* Tenants Tab */}
        {canSeeTenants && (
          <TabsContent value="tenants" className="mt-4">
            {canManageTenant ? (
              <div className="space-y-4">
                {/* Create Form */}
                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="mb-3 text-sm font-medium">新建租户</h3>
                  <div className="flex gap-2">
                    <Input
                      className="flex-1"
                      placeholder="租户名称"
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                    />
                    <Button
                      onClick={async () => {
                        if (!tenantName) {
                          setError('tenant', '请输入租户名称');
                          return;
                        }
                        setError('tenant', '');
                        setLoading(true);
                        try {
                          await createTenant({ name: tenantName });
                          setTenantName('');
                          await refresh();
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={!tenantName || loading}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      新建
                    </Button>
                  </div>
                  <ErrorText text={errors['tenant']} />
                </div>

                {/* List */}
                <div className="rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      className="h-8 border-0 bg-transparent p-0 focus-visible:ring-0"
                      placeholder="搜索租户..."
                      value={tenantSearch}
                      onChange={(e) => setTenantSearch(e.target.value)}
                    />
                  </div>
                  <ScrollArea className="h-80">
                    <div className="divide-y divide-border">
                      {filteredTenants.length === 0 ? (
                        <EmptyState text="暂无租户数据" />
                      ) : (
                        paged(filteredTenants, tenantPage).map((t) => (
                          <div
                            key={t.id}
                            className="flex items-center justify-between px-4 py-3 hover:bg-muted/50"
                          >
                            <div>
                              <div className="font-medium">{t.name ?? t.id}</div>
                              <div className="text-xs text-muted-foreground">{t.createdAt}</div>
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" onClick={() => setEditingTenant(t)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setConfirmDelete({ type: 'tenant', id: t.id, name: t.name ?? t.id })
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
                  <PaginationControls
                    page={tenantPage}
                    total={filteredTenants.length}
                    pageSize={pageSize}
                    onPrev={() => setTenantPage((p) => Math.max(1, p - 1))}
                    onNext={() => setTenantPage((p) => p + 1)}
                  />
                </div>

                {/* Edit Dialog */}
                {editingTenant && (
                  <Dialog open={Boolean(editingTenant)} onOpenChange={() => setEditingTenant(null)}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>编辑租户</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">租户名称</label>
                          <Input
                            value={editingTenant.name ?? ''}
                            onChange={(e) => setEditingTenant({ ...editingTenant, name: e.target.value })}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingTenant(null)}>
                          取消
                        </Button>
                        <Button
                          onClick={async () => {
                            if (!editingTenant.name) return;
                            setLoading(true);
                            try {
                              await updateTenant(editingTenant.id, { name: editingTenant.name });
                              setEditingTenant(null);
                              await refresh();
                            } finally {
                              setLoading(false);
                            }
                          }}
                          loading={loading}
                        >
                          保存
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            ) : (
              <NoAccess reason="无租户管理权限" />
            )}
          </TabsContent>
        )}

        {/* Products Tab */}
        {canSeeProducts && (
          <TabsContent value="products" className="mt-4">
            {canManageProduct ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Products Section */}
                <div className="space-y-4">
                  {/* Create Form */}
                  <div className="rounded-lg border border-border bg-card p-4">
                    <h3 className="mb-3 text-sm font-medium">新建产品</h3>
                    <div className="space-y-3">
                      <Input
                        placeholder="产品名称"
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                      />
                      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
                        <div className="mb-2 text-xs font-medium">SLA（分钟）</div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            className="h-8 text-xs"
                            placeholder="高-接单"
                            value={productSla.highAccept ?? ''}
                            onChange={(e) => setProductSla((s) => ({ ...s, highAccept: e.target.value }))}
                          />
                          <Input
                            className="h-8 text-xs"
                            placeholder="高-回复"
                            value={productSla.highReply ?? ''}
                            onChange={(e) => setProductSla((s) => ({ ...s, highReply: e.target.value }))}
                          />
                          <Input
                            className="h-8 text-xs"
                            placeholder="中-接单"
                            value={productSla.mediumAccept ?? ''}
                            onChange={(e) => setProductSla((s) => ({ ...s, mediumAccept: e.target.value }))}
                          />
                          <Input
                            className="h-8 text-xs"
                            placeholder="中-回复"
                            value={productSla.mediumReply ?? ''}
                            onChange={(e) => setProductSla((s) => ({ ...s, mediumReply: e.target.value }))}
                          />
                          <Input
                            className="h-8 text-xs"
                            placeholder="低-接单"
                            value={productSla.lowAccept ?? ''}
                            onChange={(e) => setProductSla((s) => ({ ...s, lowAccept: e.target.value }))}
                          />
                          <Input
                            className="h-8 text-xs"
                            placeholder="低-回复"
                            value={productSla.lowReply ?? ''}
                            onChange={(e) => setProductSla((s) => ({ ...s, lowReply: e.target.value }))}
                          />
                        </div>
                      </div>
                      <Button
                        className="w-full"
                        onClick={async () => {
                          if (!productName) {
                            setError('product', '请输入产品名称');
                            return;
                          }
                          setError('product', '');
                          setLoading(true);
                          try {
                            await createProduct({ name: productName, sla: toSlaPayload(productSla) });
                            setProductName('');
                            resetProductSla();
                            await refresh();
                          } finally {
                            setLoading(false);
                          }
                        }}
                        disabled={!productName || loading}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        新建产品
                      </Button>
                    </div>
                    <ErrorText text={errors['product']} />
                  </div>

                  {/* Products List */}
                  <div className="rounded-lg border border-border bg-card">
                    <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <Input
                        className="h-8 border-0 bg-transparent p-0 focus-visible:ring-0"
                        placeholder="搜索产品..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                      />
                    </div>
                    <ScrollArea className="h-64">
                      <div className="divide-y divide-border">
                        {filteredProducts.length === 0 ? (
                          <EmptyState text="暂无产品数据" />
                        ) : (
                          paged(filteredProducts, productPage).map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center justify-between px-4 py-3 hover:bg-muted/50"
                            >
                              <div>
                                <div className="font-medium">{p.name ?? p.id}</div>
                                <div className="text-xs text-muted-foreground">
                                  租户 {p.tenantId} · 团队{' '}
                                  {Array.isArray(p.teamIds) ? p.teamIds.length : 0}
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  title="知识库"
                                  onClick={() => setKnowledgeProduct({ id: p.id, name: p.name ?? p.id })}
                                >
                                  <BookOpen className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingProduct(p);
                                    setEditingProductTeams(
                                      Array.isArray(p.teamIds) ? p.teamIds.join(',') : ''
                                    );
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setConfirmDelete({
                                      type: 'product',
                                      id: p.id,
                                      name: p.name ?? p.id
                                    })
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
                    <PaginationControls
                      page={productPage}
                      total={filteredProducts.length}
                      pageSize={pageSize}
                      onPrev={() => setProductPage((p) => Math.max(1, p - 1))}
                      onNext={() => setProductPage((p) => p + 1)}
                    />
                  </div>
                </div>

                {/* API Keys & Category Routes */}
                <div className="space-y-4">
                  {/* API Keys */}
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="flex items-center gap-2 text-sm font-medium">
                        <KeyRound className="h-4 w-4 text-muted-foreground" />
                        Product API Key
                      </h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => setProductKeys((await adminProductKeys()).data ?? [])}
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          className="flex-1"
                          placeholder="产品ID"
                          value={apiKeyProductId}
                          onChange={(e) => setApiKeyProductId(e.target.value)}
                        />
                        <Input
                          className="flex-1"
                          placeholder="备注名称"
                          value={apiKeyName}
                          onChange={(e) => setApiKeyName(e.target.value)}
                        />
                      </div>
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={async () => {
                          if (!apiKeyProductId) {
                            setError('productKey', '请输入产品ID');
                            return;
                          }
                          setError('productKey', '');
                          setLoading(true);
                          try {
                            const res = await createProductKey({
                              productId: apiKeyProductId,
                              name: apiKeyName || undefined
                            });
                            setIssuedApiKey(res.apiKey);
                            setProductKeys((await adminProductKeys()).data ?? []);
                            setApiKeyName('');
                          } finally {
                            setLoading(false);
                          }
                        }}
                      >
                        <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                        生成 API Key
                      </Button>
                      <ErrorText text={errors['productKey']} />

                      {issuedApiKey && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              新 API Key（仅此处可见）
                            </span>
                            <Button size="sm" variant="outline" onClick={() => copyToClipboard(issuedApiKey)}>
                              <Copy className="mr-1 h-3 w-3" />
                              复制
                            </Button>
                          </div>
                          <code className="block break-all text-xs text-emerald-800 dark:text-emerald-200">
                            {issuedApiKey}
                          </code>
                        </div>
                      )}

                      <ScrollArea className="h-40">
                        <div className="space-y-1">
                          {productKeys.length === 0 ? (
                            <div className="py-4 text-center text-xs text-muted-foreground">暂无 Key</div>
                          ) : (
                            productKeys.map((k) => (
                              <div
                                key={k.id}
                                className="flex items-center justify-between rounded-lg border border-border p-2"
                              >
                                <div className="text-xs">
                                  <div className="font-medium">{k.name ?? k.id}</div>
                                  <div className="text-muted-foreground">
                                    {k.masked ?? k.id} · {k.productId}
                                    {k.revoked && (
                                      <Badge variant="warning" size="sm" className="ml-1">
                                        已吊销
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      setLoading(true);
                                      try {
                                        const res = await rotateProductKey(k.id);
                                        if (res.apiKey) setIssuedApiKey(res.apiKey);
                                        setProductKeys((await adminProductKeys()).data ?? []);
                                      } finally {
                                        setLoading(false);
                                      }
                                    }}
                                  >
                                    重置
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      setLoading(true);
                                      try {
                                        await revokeProductKey(k.id, !k.revoked);
                                        setProductKeys((await adminProductKeys()).data ?? []);
                                      } finally {
                                        setLoading(false);
                                      }
                                    }}
                                  >
                                    {k.revoked ? '启用' : '吊销'}
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>

                  {/* Category Routes */}
                  <div className="rounded-lg border border-border bg-card p-4">
                    <h3 className="mb-3 text-sm font-medium">类目路由</h3>
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          className="h-8 text-xs"
                          placeholder="产品ID"
                          value={catProductId}
                          onChange={(e) => setCatProductId(e.target.value)}
                        />
                        <Input
                          className="h-8 text-xs"
                          placeholder="类目"
                          value={catCategory}
                          onChange={(e) => setCatCategory(e.target.value)}
                        />
                        <Input
                          className="h-8 text-xs"
                          placeholder="子类目(可选)"
                          value={catSubcategory}
                          onChange={(e) => setCatSubcategory(e.target.value)}
                        />
                        <Input
                          className="h-8 text-xs"
                          placeholder="团队ID"
                          value={catTeamId}
                          onChange={(e) => setCatTeamId(e.target.value)}
                        />
                      </div>
                      <Button
                        className="w-full"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (!catProductId || !catCategory || !catTeamId) return;
                          setLoading(true);
                          try {
                            await createCategoryRoute({
                              productId: catProductId,
                              category: catCategory,
                              subcategory: catSubcategory || undefined,
                              teamId: catTeamId
                            });
                            setCatProductId('');
                            setCatCategory('');
                            setCatSubcategory('');
                            setCatTeamId('');
                            await refresh();
                          } finally {
                            setLoading(false);
                          }
                        }}
                      >
                        <Plus className="mr-1.5 h-3 w-3" />
                        新增路由
                      </Button>
                      <ScrollArea className="h-32">
                        <div className="space-y-1">
                          {categoryRoutes.length === 0 ? (
                            <div className="py-4 text-center text-xs text-muted-foreground">
                              暂无路由数据
                            </div>
                          ) : (
                            categoryRoutes.map((r) => (
                              <div
                                key={r.id}
                                className="flex items-center justify-between rounded border border-border px-2 py-1.5 text-xs"
                              >
                                <div>
                                  <span className="font-medium">
                                    {r.productId} · {r.category}
                                    {r.subcategory ? ` / ${r.subcategory}` : ''}
                                  </span>
                                  <span className="ml-2 text-muted-foreground">→ {r.teamId}</span>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setEditingCategoryRoute(r);
                                      setEditCatTeamId(r.teamId ?? '');
                                    }}
                                  >
                                    改
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      setLoading(true);
                                      try {
                                        await deleteCategoryRoute(r.id);
                                        await refresh();
                                      } finally {
                                        setLoading(false);
                                      }
                                    }}
                                  >
                                    删
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                </div>

                {/* Edit Category Route Dialog */}
                {editingCategoryRoute && (
                  <Dialog open={Boolean(editingCategoryRoute)} onOpenChange={() => setEditingCategoryRoute(null)}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>编辑类目路由</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
                          <div className="text-sm">
                            <span className="font-medium">{editingCategoryRoute.productId}</span>
                            <span className="mx-2">·</span>
                            <span>{editingCategoryRoute.category}</span>
                            {editingCategoryRoute.subcategory && (
                              <span className="text-muted-foreground"> / {editingCategoryRoute.subcategory}</span>
                            )}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">目标团队ID</label>
                          <Input
                            placeholder="团队ID"
                            value={editCatTeamId}
                            onChange={(e) => setEditCatTeamId(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingCategoryRoute(null)}>
                          取消
                        </Button>
                        <Button
                          onClick={async () => {
                            if (!editCatTeamId.trim()) return;
                            setLoading(true);
                            try {
                              await updateCategoryRoute(editingCategoryRoute.id, { teamId: editCatTeamId.trim() });
                              setEditingCategoryRoute(null);
                              setEditCatTeamId('');
                              await refresh();
                            } finally {
                              setLoading(false);
                            }
                          }}
                          loading={loading}
                          disabled={!editCatTeamId.trim()}
                        >
                          保存
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}

                {/* Edit Product Dialog */}
                {editingProduct && (
                  <Dialog open={Boolean(editingProduct)} onOpenChange={() => setEditingProduct(null)}>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>编辑产品</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">产品名称</label>
                          <Input
                            value={editingProduct.name ?? ''}
                            onChange={(e) =>
                              setEditingProduct({ ...editingProduct, name: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">SLA（分钟）</label>
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              className="h-8 text-xs"
                              placeholder="高-接单"
                              value={editingProduct.slaHighAccept ?? ''}
                              onChange={(e) =>
                                setEditingProduct({ ...editingProduct, slaHighAccept: e.target.value })
                              }
                            />
                            <Input
                              className="h-8 text-xs"
                              placeholder="高-回复"
                              value={editingProduct.slaHighReply ?? ''}
                              onChange={(e) =>
                                setEditingProduct({ ...editingProduct, slaHighReply: e.target.value })
                              }
                            />
                            <Input
                              className="h-8 text-xs"
                              placeholder="中-接单"
                              value={editingProduct.slaMediumAccept ?? ''}
                              onChange={(e) =>
                                setEditingProduct({ ...editingProduct, slaMediumAccept: e.target.value })
                              }
                            />
                            <Input
                              className="h-8 text-xs"
                              placeholder="中-回复"
                              value={editingProduct.slaMediumReply ?? ''}
                              onChange={(e) =>
                                setEditingProduct({ ...editingProduct, slaMediumReply: e.target.value })
                              }
                            />
                            <Input
                              className="h-8 text-xs"
                              placeholder="低-接单"
                              value={editingProduct.slaLowAccept ?? ''}
                              onChange={(e) =>
                                setEditingProduct({ ...editingProduct, slaLowAccept: e.target.value })
                              }
                            />
                            <Input
                              className="h-8 text-xs"
                              placeholder="低-回复"
                              value={editingProduct.slaLowReply ?? ''}
                              onChange={(e) =>
                                setEditingProduct({ ...editingProduct, slaLowReply: e.target.value })
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">绑定团队（逗号分隔ID）</label>
                          <Input
                            placeholder="team-a,team-b"
                            value={editingProductTeams}
                            onChange={(e) => setEditingProductTeams(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingProduct(null)}>
                          取消
                        </Button>
                        <Button
                          onClick={async () => {
                            const slaPayload = toSlaPayload({
                              highAccept: editingProduct.slaHighAccept,
                              highReply: editingProduct.slaHighReply,
                              mediumAccept: editingProduct.slaMediumAccept,
                              mediumReply: editingProduct.slaMediumReply,
                              lowAccept: editingProduct.slaLowAccept,
                              lowReply: editingProduct.slaLowReply
                            });
                            const hasSlaChange = Object.values(slaPayload).some((v) => v !== undefined);
                            const teamIds = editingProductTeams
                              .split(',')
                              .map((t) => t.trim())
                              .filter(Boolean);
                            const hasTeamChange =
                              editingProductTeams.length > 0 ||
                              (Array.isArray(editingProduct.teamIds) &&
                                editingProduct.teamIds.length > 0 &&
                                editingProductTeams.length === 0);
                            if (!editingProduct.name && !hasSlaChange && !hasTeamChange) return;
                            setLoading(true);
                            try {
                              await updateProduct(editingProduct.id, {
                                ...(editingProduct.name ? { name: editingProduct.name } : {}),
                                ...(hasSlaChange ? { sla: slaPayload } : {}),
                                ...(hasTeamChange ? { teamIds } : {})
                              });
                              setEditingProduct(null);
                              setEditingProductTeams('');
                              await refresh();
                            } finally {
                              setLoading(false);
                            }
                          }}
                          loading={loading}
                        >
                          保存
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            ) : (
              <NoAccess reason="无产品管理权限" />
            )}
          </TabsContent>
        )}

        {/* Teams Tab */}
        {canSeeTeams && (
          <TabsContent value="teams" className="mt-4">
            {canManageTeam ? (
              <div className="space-y-4">
                {/* Create Form */}
                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="mb-3 text-sm font-medium">新建团队</h3>
                  <div className="space-y-3">
                    <Input
                      placeholder="团队名称"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={teamReassign}
                        onChange={(e) => setTeamReassign(e.target.checked)}
                        className="h-4 w-4 rounded border-input"
                      />
                      允许重分配
                    </label>
                    <Button
                      className="w-full"
                      onClick={async () => {
                        if (!teamName) {
                          setError('team', '请输入团队名称');
                          return;
                        }
                        setError('team', '');
                        setLoading(true);
                        try {
                          await createTeam({ name: teamName, allowReassign: teamReassign });
                          setTeamName('');
                          await refresh();
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={!teamName || loading}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      新建团队
                    </Button>
                  </div>
                  <ErrorText text={errors['team']} />
                </div>

                {/* List */}
                <div className="rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      className="h-8 border-0 bg-transparent p-0 focus-visible:ring-0"
                      placeholder="搜索团队..."
                      value={teamSearch}
                      onChange={(e) => setTeamSearch(e.target.value)}
                    />
                  </div>
                  <ScrollArea className="h-80">
                    <div className="divide-y divide-border">
                      {filteredTeams.length === 0 ? (
                        <EmptyState text="暂无团队数据" />
                      ) : (
                        paged(filteredTeams, teamPage).map((t) => (
                          <div
                            key={t.id}
                            className="flex items-center justify-between px-4 py-3 hover:bg-muted/50"
                          >
                            <div>
                              <div className="font-medium">{t.name ?? t.id}</div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>允许重分配: {String(t.allowReassign ?? true)}</span>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" onClick={() => setEditingTeam(t)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setConfirmDelete({ type: 'team', id: t.id, name: t.name ?? t.id })
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
                  <PaginationControls
                    page={teamPage}
                    total={filteredTeams.length}
                    pageSize={pageSize}
                    onPrev={() => setTeamPage((p) => Math.max(1, p - 1))}
                    onNext={() => setTeamPage((p) => p + 1)}
                  />
                </div>

                {/* Edit Dialog */}
                {editingTeam && (
                  <Dialog open={Boolean(editingTeam)} onOpenChange={() => setEditingTeam(null)}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>编辑团队</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">团队名称</label>
                          <Input
                            value={editingTeam.name ?? ''}
                            onChange={(e) => setEditingTeam({ ...editingTeam, name: e.target.value })}
                          />
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={editingTeam.allowReassign ?? true}
                            onChange={(e) =>
                              setEditingTeam({ ...editingTeam, allowReassign: e.target.checked })
                            }
                            className="h-4 w-4 rounded border-input"
                          />
                          允许重分配
                        </label>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingTeam(null)}>
                          取消
                        </Button>
                        <Button
                          onClick={async () => {
                            if (!editingTeam.name) return;
                            setLoading(true);
                            try {
                              await updateTeam(editingTeam.id, {
                                name: editingTeam.name,
                                allowReassign: editingTeam.allowReassign
                              });
                              setEditingTeam(null);
                              await refresh();
                            } finally {
                              setLoading(false);
                            }
                          }}
                          loading={loading}
                        >
                          保存
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            ) : (
              <NoAccess reason="无团队管理权限" />
            )}
          </TabsContent>
        )}

        {/* Templates Tab */}
        {canSeeTemplates && (
          <TabsContent value="templates" className="mt-4">
            {canManageTemplate ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Create Form */}
                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="mb-3 text-sm font-medium">新建模板</h3>
                  <div className="space-y-3">
                    <Input
                      placeholder="模板标题"
                      value={templateTitle}
                      onChange={(e) => setTemplateTitle(e.target.value)}
                    />
                    <Input
                      placeholder="产品ID"
                      value={templateProductId}
                      onChange={(e) => setTemplateProductId(e.target.value)}
                      list="product-options"
                    />
                    <Input
                      placeholder="分类(JSON数组)"
                      value={templateCategories}
                      onChange={(e) => setTemplateCategories(e.target.value)}
                    />
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">表单 Schema (JSON)</label>
                      <Textarea
                        className="text-xs"
                        rows={4}
                        value={templateSchema}
                        onChange={(e) => setTemplateSchema(e.target.value)}
                        placeholder='{"fields":[...]}'
                      />
                    </div>
                    <Button
                      className="w-full"
                      onClick={async () => {
                        if (!templateTitle || !templateProductId) {
                          setError('template', '请填写标题与产品ID');
                          return;
                        }
                        try {
                          JSON.parse(templateSchema || '{}');
                          JSON.parse(templateCategories || '[]');
                        } catch (e) {
                          setError('template', '请检查分类/Schema 的 JSON 格式');
                          return;
                        }
                        setError('template', '');
                        setLoading(true);
                        try {
                          await createTemplate({
                            title: templateTitle,
                            productId: templateProductId,
                            categories: templateCategories,
                            formSchema: templateSchema
                          });
                          setTemplateTitle('');
                          await refresh();
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={!templateTitle || !templateProductId || loading}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      新建模板
                    </Button>
                    <ErrorText text={errors['template']} />
                  </div>
                  <datalist id="product-options">
                    {productOptions.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </datalist>
                </div>

                {/* Templates List */}
                <div className="rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      className="h-8 border-0 bg-transparent p-0 focus-visible:ring-0"
                      placeholder="搜索模板..."
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                    />
                  </div>
                  <ScrollArea className="h-80">
                    <div className="divide-y divide-border">
                      {filteredTemplates.length === 0 ? (
                        <EmptyState text="暂无模板数据" />
                      ) : (
                        paged(filteredTemplates, templatePage).map((t) => (
                          <div
                            key={t.id}
                            className="flex items-center justify-between px-4 py-3 hover:bg-muted/50"
                          >
                            <div>
                              <div className="font-medium">{t.title ?? t.id}</div>
                              <div className="text-xs text-muted-foreground">产品 {t.productId}</div>
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" onClick={() => setEditingTemplate(t)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setConfirmDelete({
                                    type: 'template',
                                    id: t.id,
                                    name: t.title ?? t.id
                                  })
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
                  <PaginationControls
                    page={templatePage}
                    total={filteredTemplates.length}
                    pageSize={pageSize}
                    onPrev={() => setTemplatePage((p) => Math.max(1, p - 1))}
                    onNext={() => setTemplatePage((p) => p + 1)}
                  />
                </div>

                {/* Edit Template Dialog */}
                {editingTemplate && (
                  <Dialog
                    open={Boolean(editingTemplate)}
                    onOpenChange={() => setEditingTemplate(null)}
                  >
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>编辑模板</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">标题</label>
                            <Input
                              value={editingTemplate.title ?? ''}
                              onChange={(e) =>
                                setEditingTemplate({ ...editingTemplate, title: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">产品ID</label>
                            <Input value={editingTemplate.productId ?? ''} disabled />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">分类(JSON)</label>
                          <Input
                            value={editingTemplate.categories ?? ''}
                            onChange={(e) =>
                              setEditingTemplate({ ...editingTemplate, categories: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">表单 Schema (JSON)</label>
                          <Textarea
                            className="text-xs"
                            rows={6}
                            value={editingTemplate.formSchema ?? ''}
                            onChange={(e) =>
                              setEditingTemplate({ ...editingTemplate, formSchema: e.target.value })
                            }
                          />
                        </div>
                        <FormBuilder
                          value={templateFields}
                          onChange={(fields, schemaJson) => {
                            setTemplateFields(fields);
                            setEditingTemplate({ ...editingTemplate, formSchema: schemaJson });
                          }}
                        />
                        <ErrorText text={errors['editTemplate']} />
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingTemplate(null)}>
                          取消
                        </Button>
                        <Button
                          onClick={async () => {
                            if (!editingTemplate.title) return;
                            try {
                              JSON.parse(editingTemplate.formSchema ?? '{}');
                              JSON.parse(editingTemplate.categories ?? '[]');
                            } catch (e) {
                              setError('editTemplate', '请检查 JSON 格式');
                              return;
                            }
                            setError('editTemplate', '');
                            setLoading(true);
                            try {
                              await updateTemplate(editingTemplate.id, {
                                title: editingTemplate.title,
                                categories: editingTemplate.categories,
                                formSchema: editingTemplate.formSchema
                              });
                              setEditingTemplate(null);
                              await refresh();
                            } finally {
                              setLoading(false);
                            }
                          }}
                          loading={loading}
                        >
                          保存
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            ) : (
              <NoAccess reason="无模板管理权限" />
            )}
          </TabsContent>
        )}

        {/* Users Tab */}
        {canSeeUsers && (
          <TabsContent value="users" className="mt-4">
            {canManageUser ? (
              <div className="grid gap-4 lg:grid-cols-3">
                {/* Users List */}
                <div className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border px-4 py-3">
                    <h3 className="mb-2 text-sm font-medium">客服账号</h3>
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <Input
                        className="h-8 border-0 bg-transparent p-0 focus-visible:ring-0"
                        placeholder="搜索邮箱..."
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <ScrollArea className="h-72">
                    <div className="divide-y divide-border">
                      {filteredUsers.length === 0 ? (
                        <EmptyState text="暂无用户数据" />
                      ) : (
                        filteredUsers.map((u) => (
                          <div
                            key={u.id}
                            className="flex items-center justify-between px-4 py-2 hover:bg-muted/50"
                          >
                            <div className="text-sm">
                              <div className="font-medium">{u.email ?? u.id}</div>
                              <div className="text-xs text-muted-foreground">
                                租户 {u.tenantId} ·{' '}
                                <Badge variant="secondary" size="sm">
                                  {u.role}
                                </Badge>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingUser(u);
                                setUserRoleDraft(u.role as Role);
                                setUserDisplayDraft(u.displayName ?? '');
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Agents List */}
                <div className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border px-4 py-3">
                    <h3 className="mb-2 text-sm font-medium">坐席/等级</h3>
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <Input
                        className="h-8 border-0 bg-transparent p-0 focus-visible:ring-0"
                        placeholder="搜索坐席..."
                        value={agentSearch}
                        onChange={(e) => setAgentSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <ScrollArea className="h-72">
                    <div className="divide-y divide-border">
                      {filteredAgents.length === 0 ? (
                        <EmptyState text="暂无坐席数据" />
                      ) : (
                        filteredAgents.map((a) => (
                          <div
                            key={a.userId}
                            className="flex items-center justify-between px-4 py-2 hover:bg-muted/50"
                          >
                            <div className="text-sm">
                              <div className="font-medium">{a.email ?? a.userId}</div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <span>Lv.{a.level ?? 1}</span>
                                <span>·</span>
                                <Badge
                                  variant={a.active ? 'success' : 'secondary'}
                                  size="sm"
                                >
                                  {a.active ? '激活' : '停用'}
                                </Badge>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingAgent(a);
                                setAgentTeamsInput(Array.isArray(a.teamIds) ? a.teamIds.join(',') : '');
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Customers List */}
                <div className="rounded-lg border border-border bg-card">
                  <div className="border-b border-border px-4 py-3">
                    <h3 className="mb-2 text-sm font-medium">客户聚合</h3>
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <Input
                        className="h-8 border-0 bg-transparent p-0 focus-visible:ring-0"
                        placeholder="搜索客户邮箱..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <ScrollArea className="h-72">
                    <div className="divide-y divide-border">
                      {filteredCustomers.length === 0 ? (
                        <EmptyState text="暂无客户数据" />
                      ) : (
                        filteredCustomers.map((c) => (
                          <div
                            key={`${c.email}-${c.productId ?? ''}`}
                            className="px-4 py-2 text-sm hover:bg-muted/50"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{c.email}</span>
                              <Badge variant="secondary" size="sm">
                                Lv.{c.level ?? 0}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              租户 {c.tenantId ?? '-'} · 产品 {c.productId ?? '-'} · 外部ID{' '}
                              {c.externalId ?? '-'}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Edit User Dialog */}
                {editingUser && (
                  <Dialog open={Boolean(editingUser)} onOpenChange={() => setEditingUser(null)}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>编辑用户角色</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">角色</label>
                          <Select
                            value={userRoleDraft || ''}
                            onValueChange={(v) => setUserRoleDraft(v as Role)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="选择角色" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.values(Role).map((r) => (
                                <SelectItem key={r} value={r}>
                                  {r}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">显示名</label>
                          <Input
                            placeholder="显示名"
                            value={userDisplayDraft}
                            onChange={(e) => setUserDisplayDraft(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingUser(null)}>
                          取消
                        </Button>
                        <Button
                          onClick={async () => {
                            if (!editingUser) return;
                            setLoading(true);
                            try {
                              await updateUser(editingUser.id, {
                                role: userRoleDraft || undefined,
                                displayName: userDisplayDraft || undefined
                              });
                              setEditingUser(null);
                              setUserRoleDraft('');
                              setUserDisplayDraft('');
                              await refresh();
                            } finally {
                              setLoading(false);
                            }
                          }}
                          loading={loading}
                          disabled={!userRoleDraft}
                        >
                          保存
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}

                {/* Edit Agent Dialog */}
                {editingAgent && (
                  <Dialog open={Boolean(editingAgent)} onOpenChange={() => setEditingAgent(null)}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>编辑坐席</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">等级</label>
                            <Input
                              type="number"
                              value={editingAgent.level ?? 1}
                              onChange={(e) =>
                                setEditingAgent({ ...editingAgent, level: Number(e.target.value) })
                              }
                            />
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={editingAgent.active ?? true}
                              onChange={(e) =>
                                setEditingAgent({ ...editingAgent, active: e.target.checked })
                              }
                              className="h-4 w-4 rounded border-input"
                            />
                            <label className="text-sm font-medium">激活</label>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">团队ID（逗号分隔）</label>
                          <Input
                            placeholder="team-a,team-b"
                            value={agentTeamsInput}
                            onChange={(e) => setAgentTeamsInput(e.target.value)}
                          />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">显示名</label>
                            <Input
                              placeholder="显示名"
                              value={editingAgent.displayName ?? ''}
                              onChange={(e) =>
                                setEditingAgent({ ...editingAgent, displayName: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">邮箱</label>
                            <Input
                              placeholder="邮箱"
                              value={editingAgent.email ?? ''}
                              onChange={(e) =>
                                setEditingAgent({ ...editingAgent, email: e.target.value })
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">头像 URL</label>
                          <Input
                            placeholder="头像 URL"
                            value={editingAgent.avatarUrl ?? ''}
                            onChange={(e) =>
                              setEditingAgent({ ...editingAgent, avatarUrl: e.target.value })
                            }
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setEditingAgent(null)}>
                          取消
                        </Button>
                        <Button
                          onClick={async () => {
                            setLoading(true);
                            try {
                              await updateAgent(editingAgent.userId, {
                                level: Number(editingAgent.level) || 1,
                                active: Boolean(editingAgent.active),
                                teamIds: agentTeamsInput
                                  .split(',')
                                  .map((t) => t.trim())
                                  .filter(Boolean),
                                displayName: editingAgent.displayName || undefined,
                                email: editingAgent.email || undefined,
                                avatarUrl: editingAgent.avatarUrl || undefined
                              });
                              setEditingAgent(null);
                              setAgentTeamsInput('');
                              await refresh();
                            } finally {
                              setLoading(false);
                            }
                          }}
                          loading={loading}
                        >
                          保存
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            ) : (
              <NoAccess reason="无用户管理权限" />
            )}
          </TabsContent>
        )}

        {/* AI Config Tab */}
        {canSeeAI && (
          <TabsContent value="ai" className="mt-4">
            <AIConfigPanel onRefresh={refresh} />
          </TabsContent>
        )}
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
            此操作不可撤销，确定删除"<strong>{confirmDelete?.name ?? confirmDelete?.id}</strong>"？
          </p>
          <div className="space-y-2">
            <label className="text-sm font-medium">请输入名称确认删除：</label>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={confirmDelete?.name ?? ''}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              取消
            </Button>
            <Button
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/10"
              disabled={!confirmDelete || confirmName !== (confirmDelete?.name ?? confirmDelete?.id)}
              onClick={async () => {
                if (!confirmDelete) return;
                setLoading(true);
                try {
                  if (confirmDelete.type === 'tenant') await deleteTenant(confirmDelete.id);
                  if (confirmDelete.type === 'product') await deleteProduct(confirmDelete.id);
                  if (confirmDelete.type === 'team') await deleteTeam(confirmDelete.id);
                  if (confirmDelete.type === 'template') await deleteTemplate(confirmDelete.id);
                  await refresh();
                  setConfirmDelete(null);
                  setConfirmName('');
                } finally {
                  setLoading(false);
                }
              }}
              loading={loading}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Knowledge Base Dialog */}
      {knowledgeProduct && (
        <KnowledgeBaseDialog
          productId={knowledgeProduct.id}
          productName={knowledgeProduct.name}
          open={Boolean(knowledgeProduct)}
          onOpenChange={(open) => !open && setKnowledgeProduct(null)}
        />
      )}
    </div>
  );
}
