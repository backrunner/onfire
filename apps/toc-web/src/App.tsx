import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Button, Panel, Input } from '@onfire/ui';
import { OnfireClient, type CreateTicketInput } from '@onfire/sdk';
import type { TicketTemplate } from '@onfire/shared';
import Tickets from './Tickets';

type TemplateField = {
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'select' | 'number' | 'email';
  required?: boolean;
  options?: { label: string; value: string }[];
  placeholder?: string;
};

type TokenIdentity = {
  email?: string;
  externalId?: string;
  level?: number;
  productId?: string;
  tenantId?: string;
};

type TemplateView = TicketTemplate & {
  categoriesParsed: { label: string; value: string; children?: { label: string; value: string }[] }[];
  fields: TemplateField[];
};

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void }) => string;
      reset: (id?: string) => void;
    };
  }
}

const parseFields = (schema: TicketTemplate['formSchema']): TemplateField[] => {
  if (!schema) return [];
  const fields = Array.isArray(schema) ? schema : (schema as any).fields;
  if (!Array.isArray(fields)) return [];
  return fields
    .map((f) => ({
      name: (f.key as string) ?? (f.name as string),
      label: (f.label as string) ?? f.name ?? f.key,
      type: (f.type as TemplateField['type']) ?? 'text',
      required: Boolean(f.required),
      options: Array.isArray(f.options) ? (f.options as any[]).map((o) => ({ label: String(o.label ?? o), value: String(o.value ?? o) })) : undefined,
      placeholder: f.placeholder as string | undefined
    }))
    .filter((f) => f.name);
};

const parseCategories = (tpl: TicketTemplate): { label: string; value: string; children?: { label: string; value: string }[] }[] => {
  const raw = (tpl.formSchema as any)?.categories ?? tpl.categories;
  if (Array.isArray(raw)) {
    return raw
      .map((c: any) => {
        if (typeof c === 'string') return { label: c, value: c };
        if (c && typeof c === 'object') {
          return {
            label: c.label ?? c.value ?? '',
            value: c.value ?? c.label ?? '',
            children: Array.isArray(c.children)
              ? c.children.map((cc: any) => ({ label: cc.label ?? cc.value ?? '', value: cc.value ?? cc.label ?? '' }))
              : undefined
          };
        }
        return null;
      })
      .filter(Boolean) as any[];
  }
  try {
    const parsed = JSON.parse(raw as string);
    return Array.isArray(parsed)
      ? parsed.map((c: any) => ({
          label: c.label ?? c.value ?? c,
          value: c.value ?? c.label ?? c,
          children: Array.isArray(c.children)
            ? c.children.map((cc: any) => ({ label: cc.label ?? cc.value ?? cc, value: cc.value ?? cc.label ?? cc }))
            : undefined
        }))
      : [];
  } catch {
    return [];
  }
};

const ensureDetailField = (fields: TemplateField[]): TemplateField[] => {
  const hasTextarea = fields.some((f) => f.type === 'textarea');
  if (hasTextarea) return fields;
  return [
    {
      name: 'content',
      label: '问题详情',
      type: 'textarea',
      required: true,
      placeholder: '请详细描述问题、步骤、期望'
    },
    ...fields
  ];
};

const decodeIdentity = (jwt?: string): TokenIdentity => {
  if (!jwt) return {};
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return {
      email: payload.email as string | undefined,
      externalId: (payload.externalId as string | undefined) ?? (payload.sub as string | undefined),
      level: typeof payload.level === 'number' ? (payload.level as number) : undefined,
      productId: payload.productId as string | undefined,
      tenantId: payload.tenantId as string | undefined
    };
  } catch {
    return {};
  }
};

const inputClass =
  'h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-100';

export default function App() {
  const search = useMemo(() => new URLSearchParams(window.location.search), []);
  const rawToken = search.get('jwt') || search.get('token') || undefined;
  const identity = useMemo(() => decodeIdentity(rawToken), [rawToken]);
  const productId = identity.productId || search.get('productId') || 'demo-product';

  const [template, setTemplate] = useState<TemplateView | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [categoryValue, setCategoryValue] = useState<string>('');
  const [subcategoryValue, setSubcategoryValue] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [showList, setShowList] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileEl = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const turnstileRendered = useRef(false);

  const client = useMemo(() => new OnfireClient({ baseUrl: '/api/toc', token: rawToken }), [rawToken]);

  useEffect(() => {
    client
      .listTemplates(productId)
      .then((list) => {
        const first = list[0];
        if (!first) return setTemplate(null);
        const parsedFields = ensureDetailField(parseFields(first.formSchema ?? {}));
        const categoriesParsed = parseCategories(first);
        setTemplate({ ...first, fields: parsedFields, categoriesParsed });
        if (categoriesParsed[0]) setCategoryValue(categoriesParsed[0].value);
        if (categoriesParsed[0]?.children?.[0]) setSubcategoryValue(categoriesParsed[0].children[0].value);
      })
      .catch(() => setTemplate(null));
  }, [client, productId]);

  useEffect(() => {
    if (turnstileRendered.current) return;
    const renderTurnstile = () => {
      if (!window.turnstile || !turnstileEl.current || turnstileRendered.current) return;
      const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY || import.meta.env.VITE_TURNSTILE_SITEKEY || '1x00000000000000000000AA';
      turnstileWidgetId.current = window.turnstile.render(turnstileEl.current, {
        sitekey,
        callback: (token) => setTurnstileToken(token)
      });
      turnstileRendered.current = true;
    };
    const ensureScript = () => {
      if (window.turnstile) return renderTurnstile();
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = renderTurnstile;
      document.head.appendChild(script);
    };
    ensureScript();
  }, []);

  const onFieldChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>, name: string) => {
    const value = e.target.value;
    setFieldValues((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!template) return;
    setSubmitting(true);
    setMessage('');

    const subject =
      fieldValues['subject'] ??
      template.fields.find((f) => f.type === 'text')?.name
        ? fieldValues[template.fields.find((f) => f.type === 'text')!.name]
        : '未命名工单';
    const detailKey = template.fields.find((f) => f.type === 'textarea')?.name;
    const content = detailKey ? fieldValues[detailKey] ?? '' : '';

    const metadataForm: Record<string, unknown> = {};
    template.fields.forEach((f) => {
      if (f.name === detailKey || f.name === 'subject') return;
      metadataForm[f.name] = fieldValues[f.name];
    });

    const payload: CreateTicketInput = {
      productId,
      templateId: template.id,
      subject: subject || '未命名工单',
      content: content || '用户未填写详情',
      metadata: {
        category: categoryValue || undefined,
        subcategory: subcategoryValue || undefined,
        form: metadataForm
      },
      customer: {
        email: identity.email ?? 'unknown@user',
        externalId: identity.externalId ?? identity.email ?? 'unknown',
        level: identity.level
      },
      turnstileToken: turnstileToken || undefined
    };

    try {
      await client.createTicket(payload);
      setMessage('提交成功，客服会尽快处理！');
      setFieldValues({});
      setTurnstileToken('');
      if (window.turnstile && turnstileWidgetId.current) {
        window.turnstile.reset(turnstileWidgetId.current);
      }
    } catch (err) {
      setMessage('提交失败，请稍后重试');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (field: TemplateField) => {
    const common = {
      name: field.name,
      required: field.required,
      value: fieldValues[field.name] ?? '',
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onFieldChange(e, field.name),
      placeholder: field.placeholder ?? field.label
    };
    if (field.type === 'textarea') {
      return <textarea {...(common as any)} rows={4} className={`${inputClass} resize-y`} />;
    }
    if (field.type === 'select' && field.options?.length) {
      return (
        <select {...(common as any)} className={inputClass}>
          <option value="">请选择</option>
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }
    return <Input {...common} type={field.type ?? 'text'} className={inputClass} />;
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-4 rounded-xl border border-zinc-200/80 bg-white/80 p-5 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white shadow-sm">
              OnFire ToC
              <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[11px] text-white">无状态 · JWT</span>
            </div>
            <h1 className="text-2xl font-semibold text-zinc-900">提交工单</h1>
            <p className="text-sm text-zinc-600">身份已由产品侧 JWT + Turnstile 校验，无需重复填写用户信息。</p>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={() => setShowList((s) => !s)}>
              {showList ? '返回提交' : '查看我的工单'}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3 shadow-sm">
            <div className="text-xs text-zinc-500">产品</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">{productId}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3 shadow-sm">
            <div className="text-xs text-zinc-500">邮箱</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">{identity.email ?? '未提供'}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3 shadow-sm">
            <div className="text-xs text-zinc-500">外部 ID</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">{identity.externalId ?? '未提供'}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3 shadow-sm">
            <div className="text-xs text-zinc-500">客户等级</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">{identity.level ?? '未标记'}</div>
          </div>
        </div>
      </header>

      {showList ? (
        <Tickets client={client} productId={productId} />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <Panel title={template?.title ?? '工单模版'} description={template ? '完全由模版驱动，字段与类目由产品侧配置' : '未找到模版'}>
            {template ? (
              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                {template.categoriesParsed.length > 0 && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-2 text-sm text-zinc-700">
                      <span className="font-medium">类目</span>
                      <select
                        value={categoryValue}
                        onChange={(e) => {
                          const next = e.target.value;
                          setCategoryValue(next);
                          const found = template.categoriesParsed.find((c) => c.value === next);
                          if (found?.children?.[0]) setSubcategoryValue(found.children[0].value);
                        }}
                        className={inputClass}
                      >
                        {template.categoriesParsed.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {template.categoriesParsed.find((c) => c.value === categoryValue)?.children?.length ? (
                      <label className="flex flex-col gap-2 text-sm text-zinc-700">
                        <span className="font-medium">子类目</span>
                        <select value={subcategoryValue} onChange={(e) => setSubcategoryValue(e.target.value)} className={inputClass}>
                          {template.categoriesParsed
                            .find((c) => c.value === categoryValue)
                            ?.children?.map((child) => (
                              <option key={child.value} value={child.value}>
                                {child.label}
                              </option>
                            ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                )}

                {template.fields.length > 0 && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {template.fields.map((field) => (
                      <label key={field.name} className="flex flex-col gap-2 text-sm text-zinc-700">
                        <span className="font-medium">
                          {field.label}
                          {field.required ? ' *' : ''}
                        </span>
                        {renderField(field)}
                      </label>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600">
                  <div ref={turnstileEl} className="min-h-[56px]" />
                  <div className="flex items-center gap-3">
                    <Button type="submit" loading={submitting}>
                      提交工单
                    </Button>
                    {message && <span className="text-emerald-600">{message}</span>}
                  </div>
                </div>
              </form>
            ) : (
              <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">当前产品未配置模版，请联系管理员</div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
