import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Button, Panel, StatCard } from '@onfire/ui';
import { OnfireClient, type CreateTicketInput } from '@onfire/sdk';
import type { TicketTemplate } from '@onfire/shared';
import Tickets from './Tickets';

type TemplateField = {
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'select' | 'number' | 'email';
  required?: boolean;
  options?: { label: string; value: string }[];
};

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void }) => string;
      reset: (id?: string) => void;
    };
  }
}

const extractTemplateFields = (schema: TicketTemplate['formSchema']): TemplateField[] => {
  if (!schema) return [];
  const fields = (schema as any).fields;
  if (!Array.isArray(fields)) return [];
  return fields
    .map((f) => ({
      name: f.name as string,
      label: (f.label as string) ?? f.name,
      type: (f.type as TemplateField['type']) ?? 'text',
      required: Boolean(f.required),
      options: f.options as TemplateField['options']
    }))
    .filter((f) => f.name);
};

const decodeJwtEmail = (jwt?: string) => {
  if (!jwt) return '';
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.email ?? payload.sub ?? '';
  } catch {
    return '';
  }
};

export default function App() {
  const search = useMemo(() => new URLSearchParams(window.location.search), []);
  const productId = search.get('productId') || 'demo-product';
  const token = search.get('jwt') || search.get('token') || undefined;
  const prefillEmail = decodeJwtEmail(token);
  const [form, setForm] = useState({
    subject: '',
    email: prefillEmail,
    externalId: prefillEmail,
    content: '',
    priority: 'medium',
    level: '',
    category: ''
  });
  const [templates, setTemplates] = useState<TicketTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [extraValues, setExtraValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [showList, setShowList] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileEl = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetId = useRef<string | null>(null);

  const client = useMemo(() => new OnfireClient({ baseUrl: '/api/toc', token }), [token]);

  const selectedTemplate = useMemo(() => templates.find((t) => t.id === selectedTemplateId) ?? null, [templates, selectedTemplateId]);
  const templateFields = useMemo(() => extractTemplateFields(selectedTemplate?.formSchema ?? {}), [selectedTemplate]);

  useEffect(() => {
    client.listTemplates(productId).then(setTemplates).catch(() => setTemplates([]));
  }, [client, productId]);

  useEffect(() => {
    if (templates.length > 0 && !selectedTemplateId) {
      setSelectedTemplateId(templates[0].id);
      setForm((f) => ({ ...f, category: templates[0].categories?.[0] ?? '' }));
    }
  }, [templates, selectedTemplateId]);

  useEffect(() => {
    if (selectedTemplate) {
      setForm((f) => ({ ...f, category: selectedTemplate.categories?.[0] ?? '' }));
      setExtraValues({});
    }
  }, [selectedTemplate]);

  useEffect(() => {
    const renderTurnstile = () => {
      if (!window.turnstile || !turnstileEl.current) return;
      const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY || import.meta.env.VITE_TURNSTILE_SITEKEY || '1x00000000000000000000AA';
      turnstileWidgetId.current = window.turnstile.render(turnstileEl.current, {
        sitekey,
        callback: (token) => setTurnstileToken(token)
      });
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

  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');
    const payload: CreateTicketInput = {
      productId,
      templateId: selectedTemplateId || undefined,
        subject: form.subject,
        content: form.content,
      priority: form.priority,
      metadata: {
        category: form.category || undefined,
        form: extraValues
      },
      customer: {
        email: form.email,
        externalId: form.externalId || form.email,
        level: form.level ? Number(form.level) : undefined
      },
      turnstileToken: turnstileToken || undefined
    };
    try {
      await client.createTicket(payload);
      setMessage('提交成功，客服会尽快处理！');
      setForm((prev) => ({
        ...prev,
        subject: '',
        content: '',
        priority: 'medium',
        level: '',
        category: selectedTemplate?.categories?.[0] ?? prev.category
      }));
      setExtraValues({});
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
      value: (extraValues[field.name] as string) ?? '',
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setExtraValues((prev) => ({ ...prev, [field.name]: e.target.value })),
      style: { padding: '10px 12px', borderRadius: 8, border: '1px solid #e4e4e7', fontSize: 14 } as const
    };
    if (field.type === 'textarea') {
      return (
        <textarea {...common} rows={4} placeholder={field.label} />
      );
    }
    if (field.type === 'select' && field.options?.length) {
      return (
        <select {...common as any}>
          <option value="">请选择</option>
          {field.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }
    return <input {...common} type={field.type ?? 'text'} placeholder={field.label} />;
  };

  const inputClass =
    'h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-100';

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-3 rounded-xl border border-zinc-200/80 bg-white/80 p-4 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-zinc-900">OnFire 客户工单</h1>
          <p className="text-sm text-zinc-600">提交、查看并跟进你的工单。身份通过 JWT + Turnstile 验证。</p>
          <span className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
            当前产品：{productId}
          </span>
        </div>
        <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => setShowList((s) => !s)}>
          {showList ? '返回提交' : '查看我的工单'}
        </Button>
        </div>
      </header>

      {showList ? (
        <Tickets client={client} productId={productId} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <StatCard title="处理中" value="2" hint="含 1 个高优先级" />
        <StatCard title="已解决" value="12" hint="过去 30 天" />
        <StatCard title="待反馈" value="1" hint="长时间未回复将自动关闭" />
      </div>

          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
      <Panel title="提交工单" description="带上必要信息，帮助我们更快响应">
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm text-zinc-700">
                  <span className="font-medium">模板</span>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className={inputClass}
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm text-zinc-700">
                  <span className="font-medium">类目</span>
                  <select name="category" value={form.category} onChange={onChange} className={inputClass}>
                    {(selectedTemplate?.categories ?? []).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm text-zinc-700">
                  <span className="font-medium">邮箱</span>
            <input
              required
              name="email"
              type="email"
              value={form.email}
              onChange={onChange}
              placeholder="you@example.com"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm text-zinc-700">
                  <span className="font-medium">外部 ID</span>
                  <input
                    name="externalId"
                    value={form.externalId}
                    onChange={onChange}
                    placeholder="客户系统用户 ID"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm text-zinc-700">
                  <span className="font-medium">客户等级</span>
                  <input
                    name="level"
                    value={form.level}
                    onChange={onChange}
                    placeholder="数字，越大优先级越高"
                    className={inputClass}
            />
          </label>
                <label className="flex flex-col gap-2 text-sm text-zinc-700">
                  <span className="font-medium">优先级</span>
                  <select name="priority" value={form.priority} onChange={onChange} className={inputClass}>
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-2 text-sm text-zinc-700">
                <span className="font-medium">主题</span>
            <input
              required
              name="subject"
              value={form.subject}
              onChange={onChange}
              placeholder="请简要描述你的问题"
                  className={inputClass}
            />
          </label>
              <label className="flex flex-col gap-2 text-sm text-zinc-700">
                <span className="font-medium">详细描述</span>
            <textarea
              required
              name="content"
              value={form.content}
              onChange={onChange}
              placeholder="提供更多上下文、截图或复现步骤"
              rows={6}
                  className={`${inputClass} resize-y`}
            />
          </label>

              {templateFields.length > 0 && (
                <div className="grid gap-3 md:grid-cols-2">
                  {templateFields.map((field) => (
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
      </Panel>
          </div>
        </>
      )}
    </div>
  );
}
