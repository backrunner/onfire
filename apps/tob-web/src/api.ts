import type { Ticket, TicketPriority, TicketStatus } from '@onfire/shared';

export interface TicketDetail {
  ticket: Ticket;
  replies?: unknown[];
  history?: unknown[];
  timeline?: unknown[];
}

/**
 * Unified API Response Format
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  ret: number;
  data: T | null;
  message?: string;
}

/**
 * API Error class for unified error handling
 */
export class ApiError extends Error {
  status: number;
  ret: number;

  constructor(message: string, status: number, ret: number = status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.ret = ret;
  }
}

const baseUrl = '/api/tob';

const authHeaders = (): HeadersInit => {
  const token = localStorage.getItem('onfire.session');
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
};

/**
 * Response interceptor that unwraps the unified response format
 * Extracts data from { success, ret, data } wrapper
 */
const json = async <T = any>(res: Response): Promise<T> => {
  // Handle HTTP errors first
  if (res.status === 401) {
    throw new ApiError('unauthorized', 401);
  }
  if (res.status === 428) {
    throw new ApiError('setup_required', 428);
  }

  // Try to parse JSON
  let body: any;
  try {
    body = await res.json();
  } catch {
    if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
    throw new ApiError('Invalid JSON response', 500);
  }

  // Check if response is in unified format
  if (body && typeof body === 'object' && 'success' in body && 'ret' in body && 'data' in body) {
    const apiResponse = body as ApiResponse<T>;

    if (!apiResponse.success) {
      // Map ret codes to HTTP-like status codes for compatibility
      const status = apiResponse.ret >= 400 ? apiResponse.ret : res.status || 500;
      throw new ApiError(apiResponse.message || 'Request failed', status, apiResponse.ret);
    }

    // Return unwrapped data
    return apiResponse.data as T;
  }

  // Legacy response format - return as-is
  if (!res.ok) {
    throw new ApiError(body?.message || `HTTP ${res.status}`, res.status);
  }

  return body as T;
};

export const fetchSummary = () => fetch(`${baseUrl}/dashboard/summary`, { headers: authHeaders() }).then(json);

export const listTickets = (params: { status?: TicketStatus; priority?: TicketPriority; teamId?: string; productId?: string; overdue?: boolean; pageSize?: number } = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) search.set(k, String(v));
  });
  return fetch(`${baseUrl}/tickets?${search.toString()}`, { headers: authHeaders() }).then(json) as Promise<{ data: Ticket[]; total: number }>;
};

export const getTicket = (id: string) => fetch(`${baseUrl}/tickets/${id}`, { headers: authHeaders() }).then(json) as Promise<TicketDetail>;

export const replyTicket = (id: string, body: { content: string }) =>
  fetch(`${baseUrl}/tickets/${id}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  }).then(json);

export const reassignTicket = (id: string, body: { assigneeId: string }) =>
  fetch(`${baseUrl}/tickets/${id}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  }).then(json);

export const escalateTicket = (id: string, body: { reason?: string }) =>
  fetch(`${baseUrl}/tickets/${id}/escalate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  }).then(json);

export const updateTicketStatus = (id: string, body: { status?: TicketStatus; reason?: string }) =>
  fetch(`${baseUrl}/tickets/${id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  }).then(json);

export const updateTicketPriority = (id: string, body: { priority: TicketPriority; reason: string }) =>
  fetch(`${baseUrl}/tickets/${id}/priority`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  }).then(json);

export const bulkUpdateStatus = (ids: string[], body: { status: TicketStatus; reason?: string }) =>
  fetch(`${baseUrl}/tickets/status/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ ids, ...body })
  }).then(json);

export const bulkAssign = (ids: string[], body: { assigneeId: string }) =>
  fetch(`${baseUrl}/tickets/assign/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ ids, ...body })
  }).then(json);

export const listTeams = () => fetch(`${baseUrl}/meta/teams`, { headers: authHeaders() }).then(json) as Promise<{ data: { id: string; name?: string }[] }>;
export const listProducts = () => fetch(`${baseUrl}/meta/products`, { headers: authHeaders() }).then(json) as Promise<{ data: { id: string; name?: string }[] }>;

export const getSession = () => fetch(`${baseUrl}/me`, { headers: authHeaders() }).then(json);

export const signIn = (body: { email: string; password: string }) =>
  fetch(`${baseUrl}/auth/email/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(json);

export const signUp = (body: { email: string; password: string; name?: string }) =>
  fetch(`${baseUrl}/auth/email/sign-up`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(json);

export const signOut = () => {
  localStorage.removeItem('onfire.session');
};

export const getInstallStatus = () => fetch(`${baseUrl}/install/status`).then(json) as Promise<{ needsSetup: boolean; hasTenant: boolean }>;

export const finalizeInstall = (body: { tenantName: string; displayName?: string }) =>
  fetch(`${baseUrl}/install/finalize`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) }).then(json);

export const changePassword = (body: { currentPassword: string; newPassword: string; revokeOtherSessions?: boolean }) =>
  fetch(`${baseUrl}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  }).then(json);

export const adminTenants = () => fetch(`${baseUrl}/admin/tenants`, { headers: authHeaders() }).then(json) as Promise<{ data: any[] }>;
export const adminProducts = () => fetch(`${baseUrl}/admin/products`, { headers: authHeaders() }).then(json) as Promise<{ data: any[] }>;
export const adminTeams = () => fetch(`${baseUrl}/admin/teams`, { headers: authHeaders() }).then(json) as Promise<{ data: any[] }>;
export const adminTemplates = () => fetch(`${baseUrl}/admin/templates`, { headers: authHeaders() }).then(json) as Promise<{ data: any[] }>;
export const adminUsers = () => fetch(`${baseUrl}/admin/users`, { headers: authHeaders() }).then(json) as Promise<{ data: any[] }>;
export const adminCustomers = () => fetch(`${baseUrl}/admin/customers`, { headers: authHeaders() }).then(json) as Promise<{ data: any[] }>;
export const adminAgents = () => fetch(`${baseUrl}/admin/agents`, { headers: authHeaders() }).then(json) as Promise<{ data: any[] }>;
export const adminCategoryRoutes = (productId?: string) =>
  fetch(`${baseUrl}/admin/category-routes${productId ? `?productId=${encodeURIComponent(productId)}` : ''}`, { headers: authHeaders() }).then(json) as Promise<{ data: any[] }>;
export const adminProductKeys = (productId?: string) =>
  fetch(`${baseUrl}/admin/product-keys${productId ? `?productId=${encodeURIComponent(productId)}` : ''}`, { headers: authHeaders() }).then(json) as Promise<{
    data: any[];
  }>;
export const createTenant = (body: { name: string }) =>
  fetch(`${baseUrl}/admin/tenants`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) }).then(json);
export const createProduct = (body: { name: string; tenantId?: string; sla?: { highAccept?: number; highReply?: number; mediumAccept?: number; mediumReply?: number; lowAccept?: number; lowReply?: number } }) =>
  fetch(`${baseUrl}/admin/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) }).then(json);
export const createProductKey = (body: { productId: string; name?: string }) =>
  fetch(`${baseUrl}/admin/product-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  }).then(json);
export const rotateProductKey = (id: string) =>
  fetch(`${baseUrl}/admin/product-keys/${id}/rotate`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() } }).then(json);
export const revokeProductKey = (id: string, revoked = true) =>
  fetch(`${baseUrl}/admin/product-keys/${id}/revoke`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ revoked })
  }).then(json);
export const createTeam = (body: { name: string; allowReassign?: boolean; tenantId?: string }) =>
  fetch(`${baseUrl}/admin/teams`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) }).then(json);
export const createTemplate = (body: { productId: string; title: string; categories?: string; formSchema?: string }) =>
  fetch(`${baseUrl}/admin/templates`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) }).then(json);

export const updateTenant = (id: string, body: { name: string }) =>
  fetch(`${baseUrl}/admin/tenants/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) }).then(json);
export const updateProduct = (
  id: string,
  body: {
    name?: string;
    sla?: { highAccept?: number; highReply?: number; mediumAccept?: number; mediumReply?: number; lowAccept?: number; lowReply?: number };
    teamIds?: string[];
  }
) =>
  fetch(`${baseUrl}/admin/products/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) }).then(json);
export const updateTeam = (id: string, body: { name?: string; allowReassign?: boolean }) =>
  fetch(`${baseUrl}/admin/teams/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) }).then(json);
export const updateTemplate = (id: string, body: { title?: string; categories?: string; formSchema?: string }) =>
  fetch(`${baseUrl}/admin/templates/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) }).then(json);
export const updateAgent = (id: string, body: { level?: number; active?: boolean; teamIds?: string[]; displayName?: string; email?: string; avatarUrl?: string }) =>
  fetch(`${baseUrl}/admin/agents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) }).then(json);
export const updateUser = (id: string, body: { role?: string; displayName?: string; tenantId?: string }) =>
  fetch(`${baseUrl}/admin/users/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) }).then(json);
export const createCategoryRoute = (body: { productId: string; category: string; subcategory?: string; teamId: string }) =>
  fetch(`${baseUrl}/admin/category-routes`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) }).then(json);
export const updateCategoryRoute = (id: string, body: { category?: string; subcategory?: string; teamId?: string }) =>
  fetch(`${baseUrl}/admin/category-routes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) }).then(json);
export const deleteCategoryRoute = (id: string) =>
  fetch(`${baseUrl}/admin/category-routes/${id}`, { method: 'DELETE', headers: authHeaders() }).then(json);
export const deleteTenant = (id: string) => fetch(`${baseUrl}/admin/tenants/${id}`, { method: 'DELETE', headers: authHeaders() }).then(json);
export const deleteProduct = (id: string) => fetch(`${baseUrl}/admin/products/${id}`, { method: 'DELETE', headers: authHeaders() }).then(json);
export const deleteTeam = (id: string) => fetch(`${baseUrl}/admin/teams/${id}`, { method: 'DELETE', headers: authHeaders() }).then(json);
export const deleteTemplate = (id: string) => fetch(`${baseUrl}/admin/templates/${id}`, { method: 'DELETE', headers: authHeaders() }).then(json);

// AI Config APIs
export interface AIConfigMeta {
  providers: {
    id: string;
    name: string;
    models: string[];
    baseUrl?: string;
    supportsStreaming: boolean;
    supportsTools: boolean;
  }[];
  taskTypes: {
    id: string;
    name: string;
    description: string;
  }[];
}

export interface AIConfig {
  id: string;
  taskType: string;
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export const getAIConfigMeta = () =>
  fetch(`${baseUrl}/admin/ai-config/meta`, { headers: authHeaders() }).then(json) as Promise<AIConfigMeta>;

export const listAIConfigs = () =>
  fetch(`${baseUrl}/admin/ai-config`, { headers: authHeaders() }).then(json) as Promise<AIConfig[]>;

export const createAIConfig = (body: {
  taskType: string;
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  enabled?: boolean;
}) =>
  fetch(`${baseUrl}/admin/ai-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  }).then(json);

export const updateAIConfig = (
  id: string,
  body: {
    provider?: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    enabled?: boolean;
  }
) =>
  fetch(`${baseUrl}/admin/ai-config/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  }).then(json);

export const deleteAIConfig = (id: string) =>
  fetch(`${baseUrl}/admin/ai-config/${id}`, { method: 'DELETE', headers: authHeaders() }).then(json);

export const testAIConfig = (id: string) =>
  fetch(`${baseUrl}/admin/ai-config/${id}/test`, {
    method: 'POST',
    headers: authHeaders()
  }).then(json) as Promise<{ success: boolean; message: string }>;

// Knowledge Base APIs
export interface ProductDocument {
  id: string;
  productId: string;
  filename: string;
  r2Key: string;
  mimeType: string;
  sizeBytes: number;
  status: 'pending' | 'processing' | 'ready' | 'error';
  vectorizeIds: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductKnowledge {
  id: string;
  productId: string;
  title: string;
  content: string;
  knowledgeType: 'description' | 'faq' | 'feature' | 'policy' | 'troubleshooting';
  vectorizeIds: string | null;
  createdAt: string;
  updatedAt: string;
}

export const listProductDocuments = (productId: string) =>
  fetch(`${baseUrl}/admin/products/${productId}/documents`, { headers: authHeaders() }).then(json) as Promise<{ data: ProductDocument[] }>;

export const uploadProductDocument = async (productId: string, file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const token = localStorage.getItem('onfire.session');
  return fetch(`${baseUrl}/admin/products/${productId}/documents`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  }).then(json);
};

export const deleteProductDocument = (productId: string, docId: string) =>
  fetch(`${baseUrl}/admin/products/${productId}/documents/${docId}`, {
    method: 'DELETE',
    headers: authHeaders()
  }).then(json);

export const downloadProductDocument = (productId: string, docId: string) =>
  `${baseUrl}/admin/products/${productId}/documents/${docId}/download`;

export const listProductKnowledge = (productId: string) =>
  fetch(`${baseUrl}/admin/products/${productId}/knowledge`, { headers: authHeaders() }).then(json) as Promise<{ data: ProductKnowledge[] }>;

export const createProductKnowledge = (
  productId: string,
  body: { title: string; content: string; knowledgeType: string }
) =>
  fetch(`${baseUrl}/admin/products/${productId}/knowledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  }).then(json);

export const updateProductKnowledge = (
  productId: string,
  knowledgeId: string,
  body: { title?: string; content?: string; knowledgeType?: string }
) =>
  fetch(`${baseUrl}/admin/products/${productId}/knowledge/${knowledgeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  }).then(json);

export const deleteProductKnowledge = (productId: string, knowledgeId: string) =>
  fetch(`${baseUrl}/admin/products/${productId}/knowledge/${knowledgeId}`, {
    method: 'DELETE',
    headers: authHeaders()
  }).then(json);

// AI Screening APIs
export interface AIScreeningResult {
  id: string;
  status: string | null;
  result: {
    validity: 'valid' | 'invalid' | 'spam' | 'rant';
    confidence: number;
    extractedIssues: string[];
    suggestedTags: string[];
    keywords: string[];
    autoAction?: 'close' | 'reply' | null;
    reasoning: string;
  } | null;
  suggestedReply: string | null;
  extractedIssues: string[];
  keywords: string[];
}

export const screenTicket = (ticketId: string) =>
  fetch(`${baseUrl}/ai/screen/${ticketId}`, {
    method: 'POST',
    headers: authHeaders()
  }).then(json) as Promise<{ success: boolean; result?: any; message?: string }>;

export const getTicketScreening = (ticketId: string) =>
  fetch(`${baseUrl}/ai/screen/${ticketId}`, { headers: authHeaders() }).then(json) as Promise<AIScreeningResult>;

export const generatePreReply = (ticketId: string) =>
  fetch(`${baseUrl}/ai/prereply/${ticketId}`, {
    method: 'POST',
    headers: authHeaders()
  }).then(json) as Promise<{ success: boolean; result?: { reply: string; confidence: number; sourcesUsed: string[] }; message?: string }>;

export const batchScreenTickets = (body: { ticketIds?: string[]; limit?: number }) =>
  fetch(`${baseUrl}/tasks/ai-screen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  }).then(json) as Promise<{ success: boolean; processed: number; succeeded: number; failed: number }>;

// AI Chat APIs
export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: any[];
  toolResults?: any[];
  createdAt: string;
}

export interface AIChatResponse {
  sessionId: string;
  message: string;
  toolCalls?: { name: string; args: any }[];
  toolResults?: { name: string; result: any }[];
}

export const sendAIChatMessage = (body: { message: string; sessionId?: string }) =>
  fetch(`${baseUrl}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  }).then(json) as Promise<AIChatResponse>;

export const sendAIChatMessageStream = async (
  body: { message: string; sessionId?: string },
  onChunk: (chunk: { type: string; content?: string; sessionId?: string; message?: string }) => void
) => {
  const token = localStorage.getItem('onfire.session');
  const response = await fetch(`${baseUrl}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          onChunk(data);
        } catch {}
      }
    }
  }
};

export const getAIChatHistory = (sessionId?: string) =>
  fetch(`${baseUrl}/ai/chat/history${sessionId ? `?sessionId=${sessionId}` : ''}`, {
    headers: authHeaders()
  }).then(json) as Promise<{ sessionId?: string; messages?: AIChatMessage[]; sessions?: string[] }>;

export const deleteAIChatSession = (sessionId: string) =>
  fetch(`${baseUrl}/ai/chat/session/${sessionId}`, {
    method: 'DELETE',
    headers: authHeaders()
  }).then(json);

// Search APIs
export interface SearchResult {
  id: string;
  subject: string;
  content: string;
  status: string;
  priority: string;
  productId: string;
  teamId: string;
  customerEmail: string;
  createdAt: string;
  score?: number;
  matchType: 'semantic' | 'keyword' | 'filter';
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  searchType: 'semantic' | 'keyword' | 'hybrid';
}

export interface SearchParams {
  q: string;
  semantic?: boolean;
  status?: string;
  priority?: string;
  teamId?: string;
  productId?: string;
  dateFrom?: string;
  dateTo?: string;
  tags?: string[];
  excludeTags?: string[];
  page?: number;
  pageSize?: number;
}

export const searchTickets = (params: SearchParams) => {
  const search = new URLSearchParams();
  search.set('q', params.q);
  if (params.semantic) search.set('semantic', 'true');
  if (params.status) search.set('status', params.status);
  if (params.priority) search.set('priority', params.priority);
  if (params.teamId) search.set('teamId', params.teamId);
  if (params.productId) search.set('productId', params.productId);
  if (params.dateFrom) search.set('dateFrom', params.dateFrom);
  if (params.dateTo) search.set('dateTo', params.dateTo);
  if (params.tags?.length) search.set('tags', params.tags.join(','));
  if (params.excludeTags?.length) search.set('excludeTags', params.excludeTags.join(','));
  if (params.page) search.set('page', String(params.page));
  if (params.pageSize) search.set('pageSize', String(params.pageSize));

  return fetch(`${baseUrl}/search?${search.toString()}`, {
    headers: authHeaders()
  }).then(json) as Promise<SearchResponse>;
};

export const getSearchSuggestions = (q: string) =>
  fetch(`${baseUrl}/search/suggestions?q=${encodeURIComponent(q)}`, {
    headers: authHeaders()
  }).then(json) as Promise<{ suggestions: string[] }>;

// Email Config APIs
export interface EmailConfig {
  id: string;
  productId: string;
  inboundEnabled: boolean;
  inboundProvider: string | null;
  inboundAddress: string | null;
  inboundWebhookSecret: string | null;
  outboundEnabled: boolean;
  outboundProvider: string | null;
  outboundApiKey: string | null;
  outboundSmtpHost: string | null;
  outboundSmtpPort: number | null;
  outboundSmtpUser: string | null;
  outboundSmtpPass: string | null;
  outboundSenderName: string | null;
  outboundSenderEmail: string | null;
  outboundReplyTo: string | null;
  aiFilterEnabled: boolean;
  aiFilterStrictness: 'low' | 'medium' | 'high' | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailConfigMeta {
  providers: { id: string; name: string; type: string }[];
  templateTypes: string[];
  defaultTemplates: Record<string, { subject: string; body: string }>;
}

export interface EmailTemplate {
  id: string;
  productId: string;
  templateType: string;
  subjectTemplate: string;
  bodyTemplate: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export const getEmailConfigMeta = () =>
  fetch(`${baseUrl}/admin/email-config/meta`, { headers: authHeaders() }).then(json) as Promise<EmailConfigMeta>;

export const listEmailConfigs = (productId?: string) =>
  fetch(`${baseUrl}/admin/email-config${productId ? `?productId=${encodeURIComponent(productId)}` : ''}`, {
    headers: authHeaders()
  }).then(json) as Promise<{ data: EmailConfig[] }>;

export const getEmailConfig = (productId: string) =>
  fetch(`${baseUrl}/admin/email-config/${productId}`, { headers: authHeaders() }).then(json) as Promise<{ data: EmailConfig | null }>;

export const createEmailConfig = (body: Partial<EmailConfig> & { productId: string }) =>
  fetch(`${baseUrl}/admin/email-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  }).then(json);

export const updateEmailConfig = (productId: string, body: Partial<EmailConfig>) =>
  fetch(`${baseUrl}/admin/email-config/${productId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  }).then(json);

export const deleteEmailConfig = (productId: string) =>
  fetch(`${baseUrl}/admin/email-config/${productId}`, {
    method: 'DELETE',
    headers: authHeaders()
  }).then(json);

export const testEmailConfig = (productId: string, email: string) =>
  fetch(`${baseUrl}/admin/email-config/${productId}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ email })
  }).then(json) as Promise<{ ok: boolean; messageId?: string }>;

export const generateWebhookSecret = (productId: string) =>
  fetch(`${baseUrl}/admin/email-config/${productId}/webhook-secret`, {
    method: 'POST',
    headers: authHeaders()
  }).then(json) as Promise<{ ok: boolean; webhookSecret: string; message: string }>;

// Email Templates
export const listEmailTemplates = (productId?: string) =>
  fetch(`${baseUrl}/admin/email-templates${productId ? `?productId=${encodeURIComponent(productId)}` : ''}`, {
    headers: authHeaders()
  }).then(json) as Promise<{ data: EmailTemplate[] }>;

export const createEmailTemplate = (body: {
  productId: string;
  templateType: string;
  subjectTemplate: string;
  bodyTemplate: string;
  enabled?: boolean;
}) =>
  fetch(`${baseUrl}/admin/email-templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  }).then(json);

export const updateEmailTemplate = (id: string, body: Partial<EmailTemplate>) =>
  fetch(`${baseUrl}/admin/email-templates/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  }).then(json);

export const deleteEmailTemplate = (id: string) =>
  fetch(`${baseUrl}/admin/email-templates/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  }).then(json);

// Notification Channel APIs
export type NotificationChannelType = 'email' | 'pushdeer' | 'bark' | 'ntfy' | 'telegram' | 'discord';
export type NotificationTriggerEvent = 'ticket_assigned' | 'ticket_reassigned' | 'ticket_escalated';

export interface NotificationChannel {
  id: string;
  productId: string;
  channelType: NotificationChannelType;
  name: string;
  enabled: boolean;
  config: string;
  triggerEvents: NotificationTriggerEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface NotificationChannelMeta {
  channelTypes: {
    id: string;
    name: string;
    description: string;
    configFields: { key: string; label: string; type: string; required: boolean; placeholder?: string }[];
  }[];
  triggerEvents: { id: string; name: string }[];
}

export interface NotificationLog {
  id: string;
  productId: string;
  channelId: string;
  channelType: NotificationChannelType;
  ticketId: string;
  agentId: string;
  triggerEvent: NotificationTriggerEvent;
  status: 'pending' | 'sent' | 'failed';
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
}

export const getNotificationChannelMeta = () =>
  fetch(`${baseUrl}/admin/notification-channels/meta`, { headers: authHeaders() }).then(json) as Promise<NotificationChannelMeta>;

export const listNotificationChannels = (productId?: string) =>
  fetch(`${baseUrl}/admin/notification-channels${productId ? `?productId=${encodeURIComponent(productId)}` : ''}`, {
    headers: authHeaders()
  }).then(json) as Promise<{ data: NotificationChannel[] }>;

export const getNotificationChannel = (id: string) =>
  fetch(`${baseUrl}/admin/notification-channels/${id}`, { headers: authHeaders() }).then(json) as Promise<{ data: NotificationChannel }>;

export const createNotificationChannel = (body: {
  productId: string;
  channelType: NotificationChannelType;
  name: string;
  enabled?: boolean;
  config: Record<string, unknown>;
  triggerEvents: NotificationTriggerEvent[];
}) =>
  fetch(`${baseUrl}/admin/notification-channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  }).then(json);

export const updateNotificationChannel = (
  id: string,
  body: {
    name?: string;
    enabled?: boolean;
    config?: Record<string, unknown>;
    triggerEvents?: NotificationTriggerEvent[];
  }
) =>
  fetch(`${baseUrl}/admin/notification-channels/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  }).then(json);

export const deleteNotificationChannel = (id: string) =>
  fetch(`${baseUrl}/admin/notification-channels/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  }).then(json);

export const testNotificationChannel = (id: string) =>
  fetch(`${baseUrl}/admin/notification-channels/${id}/test`, {
    method: 'POST',
    headers: authHeaders()
  }).then(json) as Promise<{ ok: boolean; messageId?: string }>;

export const listNotificationLogs = (params: { productId?: string; channelId?: string; ticketId?: string; limit?: number; offset?: number } = {}) => {
  const search = new URLSearchParams();
  if (params.productId) search.set('productId', params.productId);
  if (params.channelId) search.set('channelId', params.channelId);
  if (params.ticketId) search.set('ticketId', params.ticketId);
  if (params.limit) search.set('limit', String(params.limit));
  if (params.offset) search.set('offset', String(params.offset));
  return fetch(`${baseUrl}/admin/notification-logs?${search.toString()}`, {
    headers: authHeaders()
  }).then(json) as Promise<{ data: NotificationLog[]; total: number }>;
};

