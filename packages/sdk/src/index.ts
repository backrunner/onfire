import type {
  Ticket,
  TicketID,
  TicketTemplate,
  TicketPriority,
  TicketStatus,
  ProductID
} from '@onfire/shared';

export interface OnfireClientOptions {
  baseUrl: string;
  token?: string;
  fetcher?: typeof fetch;
  tocBaseUrl?: string;
}

export interface CreateTicketInput {
  productId: ProductID;
  templateId?: string;
  subject: string;
  content: string;
  priority?: TicketPriority;
  metadata?: Record<string, unknown>;
  customer: {
    email: string;
    externalId: string;
    level?: number;
    meta?: Record<string, unknown>;
  };
  turnstileToken?: string;
}

export interface ListTicketsParams {
  productId?: ProductID;
  status?: TicketStatus;
  priority?: TicketPriority;
  page?: number;
  pageSize?: number;
}

export interface UpdateTicketStatusInput {
  status: TicketStatus;
  priority?: TicketPriority;
  reason?: string;
}

export interface ReplyTicketInput {
  content: string;
  internal?: boolean;
  turnstileToken?: string;
}

export interface IssueCustomerJwtInput {
  apiKey: string;
  email?: string;
  externalId?: string;
  level?: number;
  meta?: Record<string, unknown>;
}

export interface ReassignInput {
  assigneeId: string;
}

export interface EscalateInput {
  levelUp?: number;
  reason?: string;
}

export interface CloseTicketInput {
  reason?: string;
  turnstileToken?: string;
}

export interface ReopenTicketInput {
  reason?: string;
  turnstileToken?: string;
}

export interface TicketDetail {
  ticket: Ticket;
  replies?: unknown[];
  history?: unknown[];
  timeline?: Array<{ type: string; createdAt?: string; [key: string]: unknown }>;
}

const buildHeaders = (token?: string): HeadersInit => {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

const ensureOk = async (res: Response, action: string) => {
  if (res.ok) return;
  let detail: unknown;
  try {
    detail = await res.json();
  } catch {
    /* ignore */
  }
  const msg = typeof detail === 'string' ? detail : JSON.stringify(detail ?? {});
  throw new Error(`${action} failed: ${res.status} ${msg}`);
};

export class OnfireClient {
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly tocBaseUrl?: string;

  constructor(options: OnfireClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetcher = options.fetcher ?? fetch;
    this.token = options.token;
    this.tocBaseUrl = options.tocBaseUrl?.replace(/\/$/, '');
  }

  private headers(): HeadersInit {
    return buildHeaders(this.token);
  }

  private tocBase(): string {
    return (this.tocBaseUrl ?? this.baseUrl).replace(/\/$/, '');
  }

  private normalizeTicket(raw: any): Ticket {
    const metadata =
      raw?.metadata && typeof raw.metadata === 'string'
        ? (() => {
            try {
              return JSON.parse(raw.metadata);
            } catch {
              return raw.metadata;
            }
          })()
        : raw?.metadata;
    const acceptDeadline = raw?.slaAcceptDeadline ?? raw?.sla?.acceptDeadline;
    const replyDeadline = raw?.slaReplyDeadline ?? raw?.sla?.replyDeadline;
    const now = Date.now();
    const sla =
      acceptDeadline || replyDeadline
        ? {
            acceptDeadline,
            replyDeadline,
            acceptBreached: acceptDeadline ? Date.parse(acceptDeadline) < now : false,
            replyBreached: replyDeadline ? Date.parse(replyDeadline) < now : false
          }
        : raw?.sla;
    return {
      ...raw,
      metadata,
      sla
    };
  }

  async listTemplates(productId: ProductID): Promise<TicketTemplate[]> {
    const res = await this.fetcher(`${this.tocBase()}/templates?productId=${encodeURIComponent(productId)}`, {
      headers: this.headers()
    });
    await ensureOk(res, 'listTemplates');
    return res.json();
  }

  async createTicket(input: CreateTicketInput): Promise<Ticket> {
    const res = await this.fetcher(`${this.tocBase()}/tickets`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(input)
    });
    await ensureOk(res, 'createTicket');
    const data = await res.json();
    return this.normalizeTicket(data);
  }

  async listTickets(params: ListTicketsParams = {}): Promise<{ data: Ticket[]; total: number }> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) query.append(key, String(value));
    });

    const res = await this.fetcher(`${this.tocBase()}/tickets?${query.toString()}`, {
      headers: this.headers()
    });
    await ensureOk(res, 'listTickets');
    const data = await res.json();
    return { ...data, data: (data?.data ?? []).map((t: any) => this.normalizeTicket(t)) };
  }

  async getTicket(ticketId: TicketID): Promise<TicketDetail> {
    const res = await this.fetcher(`${this.tocBase()}/tickets/${encodeURIComponent(ticketId)}`, {
      headers: this.headers()
    });
    await ensureOk(res, 'getTicket');
    const detail = await res.json();
    return {
      ...detail,
      ticket: this.normalizeTicket(detail.ticket)
    };
  }

  async reply(ticketId: TicketID, input: ReplyTicketInput) {
    const res = await this.fetcher(`${this.tocBase()}/tickets/${encodeURIComponent(ticketId)}/reply`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(input)
    });
    await ensureOk(res, 'reply');
    const data = await res.json();
    return { ...data, ticket: data.ticket ? this.normalizeTicket(data.ticket) : undefined };
  }

  async updateStatus(ticketId: TicketID, input: UpdateTicketStatusInput) {
    const res = await this.fetcher(`${this.tocBase()}/tickets/${encodeURIComponent(ticketId)}/status`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(input)
    });
    await ensureOk(res, 'updateStatus');
    const data = await res.json();
    return { ...data, ticket: data.ticket ? this.normalizeTicket(data.ticket) : undefined };
  }

  async reassign(ticketId: TicketID, input: ReassignInput) {
    const res = await this.fetcher(`${this.tocBase()}/tickets/${encodeURIComponent(ticketId)}/assign`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(input)
    });
    await ensureOk(res, 'reassign');
    const data = await res.json();
    return { ...data, ticket: data.ticket ? this.normalizeTicket(data.ticket) : undefined };
  }

  async escalate(ticketId: TicketID, input: EscalateInput) {
    const res = await this.fetcher(`${this.tocBase()}/tickets/${encodeURIComponent(ticketId)}/escalate`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(input)
    });
    await ensureOk(res, 'escalate');
    const data = await res.json();
    return { ...data, ticket: data.ticket ? this.normalizeTicket(data.ticket) : undefined };
  }

  /**
   * Customer closes their own ticket
   */
  async closeTicket(ticketId: TicketID, input: CloseTicketInput = {}) {
    const res = await this.fetcher(`${this.tocBase()}/tickets/${encodeURIComponent(ticketId)}/close`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(input)
    });
    await ensureOk(res, 'closeTicket');
    return res.json();
  }

  /**
   * Customer reopens a closed ticket (within 7 days)
   */
  async reopenTicket(ticketId: TicketID, input: ReopenTicketInput = {}) {
    const res = await this.fetcher(`${this.tocBase()}/tickets/${encodeURIComponent(ticketId)}/reopen`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(input)
    });
    await ensureOk(res, 'reopenTicket');
    return res.json();
  }

  async issueCustomerJwt(input: IssueCustomerJwtInput): Promise<{ token: string; productId: string; tenantId: string }> {
    const res = await this.fetcher(`${this.tocBase()}/tokens/issue`, {
      method: 'POST',
      headers: { ...this.headers(), 'x-api-key': input.apiKey, Authorization: `Bearer ${input.apiKey}` },
      body: JSON.stringify({
        email: input.email,
        externalId: input.externalId,
        level: input.level,
        meta: input.meta
      })
    });
    await ensureOk(res, 'issueCustomerJwt');
    return res.json();
  }

  /**
   * 生成 ToC 前端跳转 URL（需外部准备好 JWT）
   */
  buildTocUrl(productId: ProductID, jwt: string, extraQuery?: Record<string, string | number | undefined>) {
    const base = this.tocBaseUrl ?? this.baseUrl.replace(/\/api\/toc$/, '').replace(/\/api\/tob$/, '');
    const query = new URLSearchParams({ productId, jwt });
    Object.entries(extraQuery ?? {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null) query.set(k, String(v));
    });
    return `${base}/?${query.toString()}`;
  }

  /**
   * 使用 API Key 签发 JWT 并生成 ToC URL
   */
  async buildTocUrlWithSigning(productId: ProductID, input: Omit<IssueCustomerJwtInput, 'apiKey'> & { apiKey: string }, extraQuery?: Record<string, string | number | undefined>) {
    const issued = await this.issueCustomerJwt({ ...input, apiKey: input.apiKey, email: input.email, externalId: input.externalId, level: input.level, meta: input.meta });
    const targetProductId = issued.productId ?? productId;
    return this.buildTocUrl(targetProductId, issued.token, extraQuery);
  }
}

export default OnfireClient;
