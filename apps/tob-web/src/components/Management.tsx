import { useEffect, useMemo, useState } from 'react';
import { Panel, Button, Input } from '@onfire/ui';
import { ShieldCheck, Users, Building2, LayoutList, Bot, RefreshCw, Pencil, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import {
  adminTenants,
  adminProducts,
  adminTeams,
  adminTemplates,
  adminUsers,
  adminCustomers,
  createTenant,
  createProduct,
  createTeam,
  createTemplate,
  updateTenant,
  updateProduct,
  updateTeam,
  updateTemplate,
  deleteTenant,
  deleteProduct,
  deleteTeam,
  deleteTemplate
} from '../api';
import { FormBuilder, FormField } from './FormBuilder';

const NoAccess = ({ reason }: { reason: string }) => (
  <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">{reason}</div>
);

const ErrorText = ({ text }: { text?: string }) =>
  text ? <div className="text-xs text-amber-600">{text}</div> : null;

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
  const [loading, setLoading] = useState(false);
  const [tenants, setTenants] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [tenantName, setTenantName] = useState('');
  const [editingTenant, setEditingTenant] = useState<any | null>(null);
  const [productName, setProductName] = useState('');
  const [productSla, setProductSla] = useState<{ highAccept?: string; highReply?: string; mediumAccept?: string; mediumReply?: string; lowAccept?: string; lowReply?: string }>({});
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
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'tenant' | 'product' | 'team' | 'template'; id: string; name: string } | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tenantPage, setTenantPage] = useState(1);
  const [productPage, setProductPage] = useState(1);
  const [teamPage, setTeamPage] = useState(1);
  const [templatePage, setTemplatePage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [templateFields, setTemplateFields] = useState<FormField[]>([]);

  const productOptions = useMemo(() => products.map((p) => ({ label: p.name ?? p.id, value: p.id })), [products]);
  const paged = <T,>(items: T[], page: number) => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  };

  const parseMinutes = (v?: string | number | null) => {
    if (v === undefined || v === null || v === '') return undefined;
    const num = Number(v);
    return Number.isFinite(num) ? num : undefined;
  };

  const toSlaPayload = (input: { highAccept?: string | number; highReply?: string | number; mediumAccept?: string | number; mediumReply?: string | number; lowAccept?: string | number; lowReply?: string | number }) => ({
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
      if (canManageTeam) setTeams((await adminTeams()).data ?? []);
      if (canManageTemplate) setTemplates((await adminTemplates()).data ?? []);
      if (canManageUser) setUsers((await adminUsers()).data ?? []);
      setCustomers((await adminCustomers()).data ?? []);
      // 重置分页到第一页
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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {[10, 20, 50].map((v) => (
              <option key={v} value={v}>
                每页 {v}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={refresh} loading={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {canSeeTenants && (
          <Panel title="租户管理" description="租户、域名、限流/审计" action={<ShieldCheck className="h-4 w-4 text-zinc-500" />}>
            {canManageTenant ? (
            <div className="space-y-2 text-sm text-zinc-700">
              <div className="grid gap-2 md:grid-cols-2">
                <Input placeholder="租户名称" value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
                <Button
                  size="sm"
                  className="justify-center"
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
                  disabled={!tenantName}
                >
                  新建租户
                </Button>
              </div>
              <ErrorText text={errors['tenant']} />
              <div className="rounded-lg border border-zinc-200 bg-white p-3">
                {tenants.length === 0 ? (
                  <NoAccess reason="暂无租户数据" />
                ) : (
                  <div className="space-y-2">
                    <Input placeholder="搜索租户" value={errors['tenantSearch'] ?? ''} onChange={(e) => setError('tenantSearch', e.target.value)} />
                    <div className="space-y-1 text-xs text-zinc-700">
                      {paged(
                        tenants.filter((t) =>
                          errors['tenantSearch'] ? (t.name ?? '').toLowerCase().includes(errors['tenantSearch']!.toLowerCase()) : true
                        ),
                        tenantPage
                      ).map((t) => (
                        <div key={t.id} className="flex items-center justify-between rounded border border-zinc-100 px-2 py-1">
                          <div>
                            <div className="font-semibold text-zinc-800">{t.name ?? t.id}</div>
                            <div className="text-[11px] text-zinc-500">{t.createdAt}</div>
                          </div>
                          <div className="space-x-1">
                            <Button size="sm" variant="outline" onClick={() => setEditingTenant(t)}>
                              <Pencil className="mr-1 h-3 w-3" />
                              编辑
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setConfirmDelete({ type: 'tenant', id: t.id, name: t.name ?? t.id })}>
                              <Trash2 className="mr-1 h-3 w-3" />
                              删
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span>
                        第 {tenantPage}/{Math.max(1, Math.ceil(tenants.length / pageSize))} 页
                      </span>
                      <div className="space-x-2">
                        <Button size="sm" variant="outline" disabled={tenantPage <= 1} onClick={() => setTenantPage((p) => Math.max(1, p - 1))}>
                          上一页
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={tenantPage >= Math.max(1, Math.ceil(tenants.length / pageSize))}
                          onClick={() => setTenantPage((p) => p + 1)}
                        >
                          下一页
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {editingTenant && (
                <div className="rounded-lg border border-zinc-200 bg-white p-3 space-y-2">
                  <div className="text-xs font-semibold text-zinc-800">编辑租户</div>
                  <Input value={editingTenant.name ?? ''} onChange={(e) => setEditingTenant({ ...editingTenant, name: e.target.value })} />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingTenant(null)}>
                      取消
                    </Button>
                    <Button
                      size="sm"
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
                    >
                      保存
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <NoAccess reason="无租户管理权限" />
          )}
          </Panel>
        )}

        {canSeeProducts && (
          <Panel title="产品管理" description="产品、类目、模板绑定" action={<LayoutList className="h-4 w-4 text-zinc-500" />}>
            {canManageProduct ? (
            <div className="space-y-2 text-sm text-zinc-700">
              <div className="grid gap-2 md:grid-cols-2">
                <Input placeholder="产品名称" value={productName} onChange={(e) => setProductName(e.target.value)} />
                <Button
                  size="sm"
                  className="justify-center"
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
                  disabled={!productName}
                >
                  新建产品
                </Button>
              </div>
              <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600">
                <div className="mb-1 font-medium text-zinc-800">SLA（分钟）</div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  <Input placeholder="高-接单" value={productSla.highAccept ?? ''} onChange={(e) => setProductSla((s) => ({ ...s, highAccept: e.target.value }))} />
                  <Input placeholder="高-回复" value={productSla.highReply ?? ''} onChange={(e) => setProductSla((s) => ({ ...s, highReply: e.target.value }))} />
                  <Input placeholder="中-接单" value={productSla.mediumAccept ?? ''} onChange={(e) => setProductSla((s) => ({ ...s, mediumAccept: e.target.value }))} />
                  <Input placeholder="中-回复" value={productSla.mediumReply ?? ''} onChange={(e) => setProductSla((s) => ({ ...s, mediumReply: e.target.value }))} />
                  <Input placeholder="低-接单" value={productSla.lowAccept ?? ''} onChange={(e) => setProductSla((s) => ({ ...s, lowAccept: e.target.value }))} />
                  <Input placeholder="低-回复" value={productSla.lowReply ?? ''} onChange={(e) => setProductSla((s) => ({ ...s, lowReply: e.target.value }))} />
                </div>
              </div>
              <ErrorText text={errors['product']} />
              <div className="rounded-lg border border-zinc-200 bg-white p-3">
                {products.length === 0 ? (
                  <NoAccess reason="暂无产品数据" />
                ) : (
                  <div className="space-y-2">
                    <Input placeholder="搜索产品" value={errors['productSearch'] ?? ''} onChange={(e) => setError('productSearch', e.target.value)} />
                    <div className="space-y-1 text-xs text-zinc-700">
                      {paged(
                        products.filter((p) =>
                          errors['productSearch'] ? (p.name ?? '').toLowerCase().includes(errors['productSearch']!.toLowerCase()) : true
                        ),
                        productPage
                      ).map((p) => (
                        <div key={p.id} className="flex items-center justify-between rounded border border-zinc-100 px-2 py-1">
                          <div>
                            <div className="font-semibold text-zinc-800">{p.name ?? p.id}</div>
                            <div className="text-[11px] text-zinc-500">
                              tenant {p.tenantId} · 团队 {Array.isArray(p.teamIds) ? p.teamIds.length : 0}
                            </div>
                          </div>
                          <div className="space-x-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingProduct(p);
                                setEditingProductTeams(Array.isArray(p.teamIds) ? p.teamIds.join(',') : '');
                              }}
                            >
                              <Pencil className="mr-1 h-3 w-3" />
                              编辑
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setConfirmDelete({ type: 'product', id: p.id, name: p.name ?? p.id })}>
                              <Trash2 className="mr-1 h-3 w-3" />
                              删
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span>
                        第 {productPage}/{Math.max(1, Math.ceil(products.length / pageSize))} 页
                      </span>
                      <div className="space-x-2">
                        <Button size="sm" variant="outline" disabled={productPage <= 1} onClick={() => setProductPage((p) => Math.max(1, p - 1))}>
                          上一页
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={productPage >= Math.max(1, Math.ceil(products.length / pageSize))}
                          onClick={() => setProductPage((p) => p + 1)}
                        >
                          下一页
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {editingProduct && (
                <div className="rounded-lg border border-zinc-200 bg-white p-3 space-y-2">
                  <div className="text-xs font-semibold text-zinc-800">编辑产品</div>
                  <Input value={editingProduct.name ?? ''} onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })} />
                  <div className="text-[11px] text-zinc-500">SLA（分钟）</div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                    <Input
                      placeholder="高-接单"
                      value={editingProduct.slaHighAccept ?? ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, slaHighAccept: e.target.value })}
                    />
                    <Input
                      placeholder="高-回复"
                      value={editingProduct.slaHighReply ?? ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, slaHighReply: e.target.value })}
                    />
                    <Input
                      placeholder="中-接单"
                      value={editingProduct.slaMediumAccept ?? ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, slaMediumAccept: e.target.value })}
                    />
                    <Input
                      placeholder="中-回复"
                      value={editingProduct.slaMediumReply ?? ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, slaMediumReply: e.target.value })}
                    />
                    <Input
                      placeholder="低-接单"
                      value={editingProduct.slaLowAccept ?? ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, slaLowAccept: e.target.value })}
                    />
                    <Input
                      placeholder="低-回复"
                      value={editingProduct.slaLowReply ?? ''}
                      onChange={(e) => setEditingProduct({ ...editingProduct, slaLowReply: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-zinc-500">绑定团队（逗号分隔团队ID）</div>
                    <Input placeholder="team-a,team-b" value={editingProductTeams} onChange={(e) => setEditingProductTeams(e.target.value)} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingProduct(null)}>
                      取消
                    </Button>
                    <Button
                      size="sm"
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
                          (Array.isArray(editingProduct.teamIds) && editingProduct.teamIds.length > 0 && editingProductTeams.length === 0);
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
                    >
                      保存
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <NoAccess reason="无产品管理权限" />
          )}
          </Panel>
        )}

        {canSeeTeams && (
          <Panel title="团队管理" description="团队成员、分配开关、等级" action={<Users className="h-4 w-4 text-zinc-500" />}>
            {canManageTeam ? (
            <div className="space-y-2 text-sm text-zinc-700">
              <div className="grid gap-2 md:grid-cols-2">
                <Input placeholder="团队名称" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
                <Button
                  size="sm"
                  className="justify-center"
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
                  disabled={!teamName}
                >
                  新建团队
                </Button>
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-600">
                <input type="checkbox" checked={teamReassign} onChange={(e) => setTeamReassign(e.target.checked)} className="h-4 w-4" />
                允许重分配
              </label>
              <ErrorText text={errors['team']} />
              <div className="rounded-lg border border-zinc-200 bg-white p-3">
                {teams.length === 0 ? (
                  <NoAccess reason="暂无团队数据" />
                ) : (
                  <div className="space-y-2">
                    <Input placeholder="搜索团队" value={errors['teamSearch'] ?? ''} onChange={(e) => setError('teamSearch', e.target.value)} />
                    <div className="space-y-1 text-xs text-zinc-700">
                      {paged(
                        teams.filter((t) => (errors['teamSearch'] ? (t.name ?? '').toLowerCase().includes(errors['teamSearch']!.toLowerCase()) : true)),
                        teamPage
                      ).map((t) => (
                        <div key={t.id} className="flex items-center justify-between rounded border border-zinc-100 px-2 py-1">
                          <div>
                            <div className="font-semibold text-zinc-800">{t.name ?? t.id}</div>
                            <div className="text-[11px] text-zinc-500">允许重分配: {String(t.allowReassign ?? true)}</div>
                          </div>
                          <div className="space-x-1">
                            <Button size="sm" variant="outline" onClick={() => setEditingTeam(t)}>
                              <Pencil className="mr-1 h-3 w-3" />
                              编辑
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setConfirmDelete({ type: 'team', id: t.id, name: t.name ?? t.id })}>
                              <Trash2 className="mr-1 h-3 w-3" />
                              删
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span>
                        第 {teamPage}/{Math.max(1, Math.ceil(teams.length / pageSize))} 页
                      </span>
                      <div className="space-x-2">
                        <Button size="sm" variant="outline" disabled={teamPage <= 1} onClick={() => setTeamPage((p) => Math.max(1, p - 1))}>
                          上一页
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={teamPage >= Math.max(1, Math.ceil(teams.length / pageSize))}
                          onClick={() => setTeamPage((p) => p + 1)}
                        >
                          下一页
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {editingTeam && (
                <div className="rounded-lg border border-zinc-200 bg-white p-3 space-y-2">
                  <div className="text-xs font-semibold text-zinc-800">编辑团队</div>
                  <Input value={editingTeam.name ?? ''} onChange={(e) => setEditingTeam({ ...editingTeam, name: e.target.value })} />
                  <label className="flex items-center gap-2 text-xs text-zinc-600">
                    <input
                      type="checkbox"
                      checked={editingTeam.allowReassign ?? true}
                      onChange={(e) => setEditingTeam({ ...editingTeam, allowReassign: e.target.checked })}
                      className="h-4 w-4"
                    />
                    允许重分配
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingTeam(null)}>
                      取消
                    </Button>
                    <Button
                      size="sm"
                      onClick={async () => {
                        if (!editingTeam.name) return;
                        setLoading(true);
                        try {
                          await updateTeam(editingTeam.id, { name: editingTeam.name, allowReassign: editingTeam.allowReassign });
                          setEditingTeam(null);
                          await refresh();
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      保存
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <NoAccess reason="无团队管理权限" />
          )}
          </Panel>
        )}

        {canSeeTemplates && (
          <Panel title="模板/表单" description="多级分类、Form Schema" action={<Bot className="h-4 w-4 text-zinc-500" />}>
            {canManageTemplate ? (
            <div className="space-y-2 text-sm text-zinc-700">
              <div className="grid gap-2 md:grid-cols-2">
                <Input placeholder="模板标题" value={templateTitle} onChange={(e) => setTemplateTitle(e.target.value)} />
                <Button
                  size="sm"
                  className="justify-center"
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
                  disabled={!templateTitle || !templateProductId}
                >
                  新建模板
                </Button>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <Input placeholder="产品ID" value={templateProductId} onChange={(e) => setTemplateProductId(e.target.value)} list="product-options" />
                <Input placeholder="分类(JSON)" value={templateCategories} onChange={(e) => setTemplateCategories(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-zinc-600">表单 Schema (JSON)</label>
                <textarea
                  className="mt-1 w-full rounded-lg border border-zinc-200 p-2 text-xs"
                  rows={4}
                  value={templateSchema}
                  onChange={(e) => setTemplateSchema(e.target.value)}
                  placeholder="手写或使用下方可视化编辑器生成"
                />
              </div>
              <ErrorText text={errors['template']} />
              <datalist id="product-options">
                {productOptions.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </datalist>
              <div className="rounded-lg border border-zinc-200 bg-white p-3">
                {templates.length === 0 ? (
                  <NoAccess reason="暂无模板数据" />
                ) : (
                  <div className="space-y-2">
                    <Input placeholder="搜索模板" value={errors['templateSearch'] ?? ''} onChange={(e) => setError('templateSearch', e.target.value)} />
                    <div className="space-y-1 text-xs text-zinc-700">
                      {paged(
                        templates.filter((t) => (errors['templateSearch'] ? (t.title ?? '').toLowerCase().includes(errors['templateSearch']!.toLowerCase()) : true)),
                        templatePage
                      ).map((t) => (
                        <div key={t.id} className="flex items-center justify-between rounded border border-zinc-100 px-2 py-1">
                          <div>
                            <div className="font-semibold text-zinc-800">{t.title ?? t.id}</div>
                            <div className="text-[11px] text-zinc-500">product {t.productId}</div>
                          </div>
                          <div className="space-x-1">
                            <Button size="sm" variant="outline" onClick={() => setEditingTemplate(t)}>
                              <Pencil className="mr-1 h-3 w-3" />
                              编辑
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setConfirmDelete({ type: 'template', id: t.id, name: t.title ?? t.id })}>
                              <Trash2 className="mr-1 h-3 w-3" />
                              删
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-500">
                      <span>
                        第 {templatePage}/{Math.max(1, Math.ceil(templates.length / pageSize))} 页
                      </span>
                      <div className="space-x-2">
                        <Button size="sm" variant="outline" disabled={templatePage <= 1} onClick={() => setTemplatePage((p) => Math.max(1, p - 1))}>
                          上一页
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={templatePage >= Math.max(1, Math.ceil(templates.length / pageSize))}
                          onClick={() => setTemplatePage((p) => p + 1)}
                        >
                          下一页
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {editingTemplate && (
                <div className="rounded-lg border border-zinc-200 bg-white p-3 space-y-2">
                  <div className="text-xs font-semibold text-zinc-800">编辑模板</div>
                  <div className="text-[11px] text-amber-600">
                    注意：可视化编辑器只覆盖字段列表，对高级校验/布局可继续手写 JSON。
                  </div>
                  <Input
                    placeholder="标题"
                    value={editingTemplate.title ?? ''}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, title: e.target.value })}
                  />
                  <Input
                    placeholder="产品ID"
                    value={editingTemplate.productId ?? ''}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, productId: e.target.value })}
                    disabled
                  />
                  <Input
                    placeholder="分类(JSON)"
                    value={editingTemplate.categories ?? ''}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, categories: e.target.value })}
                  />
                  <textarea
                    className="mt-1 w-full rounded-lg border border-zinc-200 p-2 text-xs"
                    rows={4}
                    value={editingTemplate.formSchema ?? ''}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, formSchema: e.target.value })}
                    placeholder="手写或使用下方可视化编辑器生成"
                  />
              <FormBuilder
                value={templateFields}
                onChange={(fields, schemaJson) => {
                  setTemplateFields(fields);
                  setEditingTemplate({ ...editingTemplate, formSchema: schemaJson });
                }}
              />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingTemplate(null)}>
                      取消
                    </Button>
                    <Button
                      size="sm"
                      onClick={async () => {
                        if (!editingTemplate.title) return;
                        try {
                          JSON.parse(editingTemplate.formSchema ?? '{}');
                          JSON.parse(editingTemplate.categories ?? '[]');
                        } catch (e) {
                          alert('请检查 JSON 格式');
                          return;
                        }
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
                    >
                      保存
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <NoAccess reason="无模板管理权限" />
          )}
          </Panel>
        )}

        {canSeeUsers && (
          <Panel title="用户 / 客户" description="客服账号、客户聚合视图" action={<Building2 className="h-4 w-4 text-zinc-500" />}>
            {canManageUser ? (
              <div className="space-y-3 text-sm text-zinc-700">
                <div className="rounded-lg border border-zinc-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-semibold text-zinc-800">客服账号</div>
                    <Input
                      placeholder="搜索邮箱"
                      value={errors['userSearch'] ?? ''}
                      onChange={(e) => setError('userSearch', e.target.value)}
                      className="h-8"
                    />
                  </div>
                  {users.length === 0 ? (
                    <NoAccess reason="暂无用户数据" />
                  ) : (
                    <div className="space-y-1 text-xs text-zinc-600">
                      {users
                        .filter((u) =>
                          errors['userSearch'] ? (u.email ?? '').toLowerCase().includes(errors['userSearch']!.toLowerCase()) : true
                        )
                        .map((u) => (
                          <div key={u.id} className="flex justify-between border-b border-zinc-100 py-1 last:border-b-0">
                            <span className="font-medium text-zinc-800">{u.email ?? u.id}</span>
                            <span>tenant {u.tenantId}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-zinc-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-semibold text-zinc-800">客户聚合</div>
                    <Input
                      placeholder="搜索客户邮箱"
                      value={errors['customerSearch'] ?? ''}
                      onChange={(e) => setError('customerSearch', e.target.value)}
                      className="h-8"
                    />
                  </div>
                  {customers.length === 0 ? (
                    <NoAccess reason="暂无客户数据" />
                  ) : (
                    <div className="space-y-1 text-xs text-zinc-600">
                      {customers
                        .filter((c) =>
                          errors['customerSearch'] ? (c.email ?? '').toLowerCase().includes(errors['customerSearch']!.toLowerCase()) : true
                        )
                        .map((c) => (
                          <div key={c.email} className="flex flex-col border-b border-zinc-100 py-1 last:border-b-0">
                            <div className="flex justify-between">
                              <span className="font-medium text-zinc-800">{c.email}</span>
                              <span className="text-[11px] text-zinc-500">工单 {c.count}</span>
                            </div>
                            <div className="text-[11px] text-zinc-500">
                              等级 {c.maxLevel ?? '-'} · 租户 {Array.isArray(c.tenantIds) ? c.tenantIds.join(',') : '-'} · 产品{' '}
                              {Array.isArray(c.productIds) ? c.productIds.join(',') : '-'}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <NoAccess reason="无用户管理权限" />
            )}
          </Panel>
        )}
      </div>

      <Dialog open={Boolean(confirmDelete)} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600">
            此操作不可撤销，确定删除“{confirmDelete?.name ?? confirmDelete?.id}”？
          </p>
          <div className="mt-2 space-y-1">
            <div className="text-xs text-zinc-600">请输入名称确认删除：</div>
            <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={confirmDelete?.name ?? ''} />
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setConfirmDelete(null)}>
              取消
            </Button>
            <Button
              size="sm"
              variant="outline"
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
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

