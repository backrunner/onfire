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
}

export interface ReassignInput {
  assigneeId: string;
}

export interface EscalateInput {
  levelUp?: number;
  reason?: string;
}

export interface TicketDetail {
  ticket: Ticket;
  replies?: unknown[];
  history?: unknown[];
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

  async listTemplates(productId: ProductID): Promise<TicketTemplate[]> {
    const res = await this.fetcher(`${this.baseUrl}/templates?productId=${encodeURIComponent(productId)}`, {
      headers: this.headers()
    });
    await ensureOk(res, 'listTemplates');
    return res.json();
  }

  async createTicket(input: CreateTicketInput): Promise<Ticket> {
    const res = await this.fetcher(`${this.baseUrl}/tickets`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(input)
    });
    await ensureOk(res, 'createTicket');
    return res.json();
  }

  async listTickets(params: ListTicketsParams = {}): Promise<{ data: Ticket[]; total: number }> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) query.append(key, String(value));
    });

    const res = await this.fetcher(`${this.baseUrl}/tickets?${query.toString()}`, {
      headers: this.headers()
    });
    await ensureOk(res, 'listTickets');
    return res.json();
  }

  async getTicket(ticketId: TicketID): Promise<TicketDetail> {
    const res = await this.fetcher(`${this.baseUrl}/tickets/${encodeURIComponent(ticketId)}`, {
      headers: this.headers()
    });
    await ensureOk(res, 'getTicket');
    return res.json();
  }

  async reply(ticketId: TicketID, input: ReplyTicketInput) {
    const res = await this.fetcher(`${this.baseUrl}/tickets/${encodeURIComponent(ticketId)}/reply`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(input)
    });
    await ensureOk(res, 'reply');
    return res.json();
  }

  async updateStatus(ticketId: TicketID, input: UpdateTicketStatusInput) {
    const res = await this.fetcher(`${this.baseUrl}/tickets/${encodeURIComponent(ticketId)}/status`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(input)
    });
    await ensureOk(res, 'updateStatus');
    return res.json();
  }

  async reassign(ticketId: TicketID, input: ReassignInput) {
    const res = await this.fetcher(`${this.baseUrl}/tickets/${encodeURIComponent(ticketId)}/assign`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(input)
    });
    await ensureOk(res, 'reassign');
    return res.json();
  }

  async escalate(ticketId: TicketID, input: EscalateInput) {
    const res = await this.fetcher(`${this.baseUrl}/tickets/${encodeURIComponent(ticketId)}/escalate`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(input)
    });
    await ensureOk(res, 'escalate');
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
}

export default OnfireClient;
