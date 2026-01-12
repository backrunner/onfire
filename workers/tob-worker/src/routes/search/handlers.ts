import { resolveContext } from '../../core/context';
import { assertPermission } from '@onfire/shared/rbac';
import { searchTickets, getSearchSuggestions, indexTicket, type SearchParams } from '../../services/search';
import type { Bindings } from '../../core/types';

export const search = async (env: Bindings, store: any, user: any, query: any) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'ticket.read');

  const params: SearchParams = {
    q: query.q as string,
    semantic: query.semantic === 'true',
    status: query.status as string | undefined,
    priority: query.priority as string | undefined,
    teamId: query.teamId as string | undefined,
    productId: query.productId as string | undefined,
    dateFrom: query.dateFrom as string | undefined,
    dateTo: query.dateTo as string | undefined,
    tags: query.tags ? (query.tags as string).split(',').filter(Boolean) : undefined,
    excludeTags: query.excludeTags ? (query.excludeTags as string).split(',').filter(Boolean) : undefined,
    page: query.page ? Number(query.page) : 1,
    pageSize: query.pageSize ? Number(query.pageSize) : 20
  };

  const results = await searchTickets(store.db, env.VECTORIZE_INDEX, params);
  return results;
};

export const getSuggestions = async (env: Bindings, store: any, user: any, prefix: string) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'ticket.read');

  if (!prefix || prefix.length < 2) {
    return { suggestions: [] };
  }

  const suggestions = await getSearchSuggestions(store.db, prefix);
  return { suggestions };
};

export const indexSingleTicket = async (env: Bindings, store: any, user: any, ticketId: string) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'tenant.manage');

  if (!env.VECTORIZE_INDEX) {
    return { success: false, message: 'Vectorize not configured' };
  }

  const success = await indexTicket(store.db, env.VECTORIZE_INDEX, ticketId);
  return { success, ticketId };
};

export const batchIndex = async (env: Bindings, store: any, user: any, ticketIds: string[]) => {
  if (!user?.id) throw new Response('Unauthorized', { status: 401 });
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'tenant.manage');

  if (!env.VECTORIZE_INDEX) {
    return { success: false, message: 'Vectorize not configured', indexed: 0, failed: 0 };
  }

  let indexed = 0;
  let failed = 0;

  for (const ticketId of ticketIds) {
    try {
      const success = await indexTicket(store.db, env.VECTORIZE_INDEX, ticketId);
      if (success) indexed++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return { success: true, indexed, failed };
};
