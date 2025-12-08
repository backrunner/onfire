import type { Ticket, TicketPriority, TicketStatus } from '@onfire/shared';

export interface TicketDetail {
  ticket: Ticket;
  replies?: unknown[];
  history?: unknown[];
}

const baseUrl = '/api/tob';

const authHeaders = () => {
  const token = localStorage.getItem('onfire.session');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const json = async (res: Response) => {
  if (res.status === 401) {
    const err = new Error('unauthorized');
    (err as any).status = 401;
    throw err;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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

export const signOut = () => {
  localStorage.removeItem('onfire.session');
};

export const adminTenants = () => fetch(`${baseUrl}/admin/tenants`, { headers: authHeaders() }).then(json) as Promise<{ data: any[] }>;
export const adminProducts = () => fetch(`${baseUrl}/admin/products`, { headers: authHeaders() }).then(json) as Promise<{ data: any[] }>;
export const adminTeams = () => fetch(`${baseUrl}/admin/teams`, { headers: authHeaders() }).then(json) as Promise<{ data: any[] }>;
export const adminTemplates = () => fetch(`${baseUrl}/admin/templates`, { headers: authHeaders() }).then(json) as Promise<{ data: any[] }>;
export const adminUsers = () => fetch(`${baseUrl}/admin/users`, { headers: authHeaders() }).then(json) as Promise<{ data: any[] }>;
export const adminCustomers = () => fetch(`${baseUrl}/admin/customers`, { headers: authHeaders() }).then(json) as Promise<{ data: any[] }>;
export const createTenant = (body: { name: string }) =>
  fetch(`${baseUrl}/admin/tenants`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) }).then(json);
export const createProduct = (body: { name: string; tenantId?: string; sla?: { highAccept?: number; highReply?: number; mediumAccept?: number; mediumReply?: number; lowAccept?: number; lowReply?: number } }) =>
  fetch(`${baseUrl}/admin/products`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(body) }).then(json);
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
export const deleteTenant = (id: string) => fetch(`${baseUrl}/admin/tenants/${id}`, { method: 'DELETE', headers: authHeaders() }).then(json);
export const deleteProduct = (id: string) => fetch(`${baseUrl}/admin/products/${id}`, { method: 'DELETE', headers: authHeaders() }).then(json);
export const deleteTeam = (id: string) => fetch(`${baseUrl}/admin/teams/${id}`, { method: 'DELETE', headers: authHeaders() }).then(json);
export const deleteTemplate = (id: string) => fetch(`${baseUrl}/admin/templates/${id}`, { method: 'DELETE', headers: authHeaders() }).then(json);

