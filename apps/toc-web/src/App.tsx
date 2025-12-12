import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  Button,
  Input,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge
} from '@onfire/ui';
import { OnfireClient, type CreateTicketInput } from '@onfire/sdk';
import type { TicketTemplate } from '@onfire/shared';
import Tickets from './Tickets';
import {
  Flame,
  Send,
  Ticket,
  User,
  Mail,
  Hash,
  Star,
  Package,
  AlertCircle,
  CheckCircle2,
  Shield
} from 'lucide-react';

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
      options: Array.isArray(f.options)
        ? (f.options as any[]).map((o) => ({ label: String(o.label ?? o), value: String(o.value ?? o) }))
        : undefined,
      placeholder: f.placeholder as string | undefined
    }))
    .filter((f) => f.name);
};

const parseCategories = (
  tpl: TicketTemplate
): { label: string; value: string; children?: { label: string; value: string }[] }[] => {
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
              ? c.children.map((cc: any) => ({
                  label: cc.label ?? cc.value ?? '',
                  value: cc.value ?? cc.label ?? ''
                }))
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
            ? c.children.map((cc: any) => ({
                label: cc.label ?? cc.value ?? cc,
                value: cc.value ?? cc.label ?? cc
              }))
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

export default function App() {
  const search = useMemo(() => new URLSearchParams(window.location.search), []);
  const rawToken = search.get('jwt') || search.get('token') || undefined;
  const identity = useMemo(() => decodeIdentity(rawToken), [rawToken]);
  const productId = identity.productId || search.get('productId') || 'demo-product';

  const [templates, setTemplates] = useState<TemplateView[]>([]);
  const [template, setTemplate] = useState<TemplateView | null>(null);
  const [templateId, setTemplateId] = useState<string>('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [categoryValue, setCategoryValue] = useState<string>('');
  const [subcategoryValue, setSubcategoryValue] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
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
        const parsed = list.map((t) => {
          const fields = ensureDetailField(parseFields(t.formSchema ?? {}));
          const categoriesParsed = parseCategories(t);
          return { ...t, fields, categoriesParsed };
        });
        setTemplates(parsed);
        const target = parsed.find((t) => t.id === templateId) ?? parsed[0];
        setTemplateId(target?.id ?? '');
        setTemplate(target ?? null);
        if (target?.categoriesParsed?.[0]) setCategoryValue(target.categoriesParsed[0].value);
        if (target?.categoriesParsed?.[0]?.children?.[0])
          setSubcategoryValue(target.categoriesParsed[0].children[0].value);
      })
      .catch(() => setTemplate(null));
  }, [client, productId, templateId]);

  useEffect(() => {
    if (turnstileRendered.current) return;
    const renderTurnstile = () => {
      if (!window.turnstile || !turnstileEl.current || turnstileRendered.current) return;
      const sitekey =
        import.meta.env.VITE_TURNSTILE_SITE_KEY ||
        import.meta.env.VITE_TURNSTILE_SITEKEY ||
        '1x00000000000000000000AA';
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

  const onFieldChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    name: string
  ) => {
    const value = e.target.value;
    setFieldValues((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!template) return;
    setSubmitting(true);
    setMessage(null);

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
      setMessage({ type: 'success', text: '提交成功，客服会尽快处理！' });
      setFieldValues({});
      setTurnstileToken('');
      if (window.turnstile && turnstileWidgetId.current) {
        window.turnstile.reset(turnstileWidgetId.current);
      }
    } catch (err) {
      setMessage({ type: 'error', text: '提交失败，请稍后重试' });
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (field: TemplateField) => {
    const value = fieldValues[field.name] ?? '';
    if (field.type === 'textarea') {
      return (
        <Textarea
          name={field.name}
          required={field.required}
          value={value}
          onChange={(e) => onFieldChange(e, field.name)}
          placeholder={field.placeholder ?? field.label}
          rows={4}
          className="resize-y"
        />
      );
    }
    if (field.type === 'select' && field.options?.length) {
      return (
        <Select value={value} onValueChange={(v) => setFieldValues((prev) => ({ ...prev, [field.name]: v }))}>
          <SelectTrigger>
            <SelectValue placeholder="请选择" />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        name={field.name}
        required={field.required}
        value={value}
        onChange={(e) => onFieldChange(e, field.name)}
        type={field.type ?? 'text'}
        placeholder={field.placeholder ?? field.label}
      />
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">客服中心</h1>
              <p className="text-xs text-muted-foreground">OnFire 工单系统</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showList ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowList((s) => !s)}
            >
              <Ticket className="mr-1.5 h-3.5 w-3.5" />
              {showList ? '新建工单' : '我的工单'}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Identity Card */}
        <div className="mb-6 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">身份信息</span>
            </div>
            <Badge variant="success" size="sm">
              <Shield className="mr-1 h-3 w-3" />
              JWT 已验证
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">产品</div>
                <div className="truncate text-sm font-medium">{productId}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">邮箱</div>
                <div className="truncate text-sm font-medium">{identity.email ?? '未提供'}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">外部 ID</div>
                <div className="truncate text-sm font-medium">{identity.externalId ?? '未提供'}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <Star className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">客户等级</div>
                <div className="text-sm font-medium">
                  {identity.level !== undefined ? (
                    <Badge variant="secondary" size="sm">
                      Lv.{identity.level}
                    </Badge>
                  ) : (
                    '未标记'
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {showList ? (
          <Tickets client={client} productId={productId} turnstileToken={turnstileToken} />
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-sm">
            {/* Template Selector */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">提交工单</span>
              </div>
              <div className="w-48">
                <Select
                  value={templateId}
                  onValueChange={(v: string) => {
                    setTemplateId(v);
                    const found = templates.find((t) => t.id === v);
                    if (found) {
                      setTemplate(found);
                      setCategoryValue(found.categoriesParsed[0]?.value ?? '');
                      setSubcategoryValue(found.categoriesParsed[0]?.children?.[0]?.value ?? '');
                      setFieldValues({});
                    }
                  }}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="选择模版" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Form Content */}
            <div className="p-4">
              {template ? (
                <form onSubmit={onSubmit} className="space-y-4">
                  {/* Categories */}
                  {template.categoriesParsed.length > 0 && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">类目</label>
                        <Select
                          value={categoryValue}
                          onValueChange={(next: string) => {
                            setCategoryValue(next);
                            const found = template.categoriesParsed.find((c) => c.value === next);
                            if (found?.children?.[0]) setSubcategoryValue(found.children[0].value);
                            else setSubcategoryValue('');
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="请选择类目" />
                          </SelectTrigger>
                          <SelectContent>
                            {template.categoriesParsed.map((c) => (
                              <SelectItem key={c.value} value={c.value}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {template.categoriesParsed.find((c) => c.value === categoryValue)?.children?.length ? (
                        <div className="space-y-2">
                          <label className="text-sm font-medium">子类目</label>
                          <Select value={subcategoryValue} onValueChange={setSubcategoryValue}>
                            <SelectTrigger>
                              <SelectValue placeholder="请选择子类目" />
                            </SelectTrigger>
                            <SelectContent>
                              {template.categoriesParsed
                                .find((c) => c.value === categoryValue)
                                ?.children?.map((child) => (
                                  <SelectItem key={child.value} value={child.value}>
                                    {child.label}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Form Fields */}
                  {template.fields.length > 0 && (
                    <div className="space-y-4">
                      {template.fields.map((field) => (
                        <div
                          key={field.name}
                          className={field.type === 'textarea' ? '' : 'grid gap-4 sm:grid-cols-2'}
                        >
                          {field.type === 'textarea' ? (
                            <div className="space-y-2">
                              <label className="text-sm font-medium">
                                {field.label}
                                {field.required && <span className="text-destructive"> *</span>}
                              </label>
                              {renderField(field)}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <label className="text-sm font-medium">
                                {field.label}
                                {field.required && <span className="text-destructive"> *</span>}
                              </label>
                              {renderField(field)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Turnstile & Submit */}
                  <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4">
                    <div ref={turnstileEl} className="min-h-[65px]" />
                    <div className="flex flex-1 items-center justify-end gap-3">
                      {message && (
                        <div
                          className={`flex items-center gap-1.5 text-sm ${
                            message.type === 'success' ? 'text-emerald-600' : 'text-destructive'
                          }`}
                        >
                          {message.type === 'success' ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <AlertCircle className="h-4 w-4" />
                          )}
                          {message.text}
                        </div>
                      )}
                      <Button type="submit" loading={submitting}>
                        <Send className="mr-1.5 h-3.5 w-3.5" />
                        提交工单
                      </Button>
                    </div>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <AlertCircle className="mb-2 h-8 w-8 opacity-50" />
                  <p className="text-sm">当前产品未配置模版，请联系管理员</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} OnFire · 现代化客服工单系统
      </footer>
    </div>
  );
}
