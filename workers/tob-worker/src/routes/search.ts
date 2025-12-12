/**
 * Search Routes
 * Endpoints for global search with semantic and keyword search
 */

import { Elysia, t } from 'elysia';
import type { Bindings, WorkerSingleton } from '../core/types';
import { resolveContext } from '../core/context';
import { assertPermission } from '@onfire/shared/rbac';
import { searchTickets, getSearchSuggestions, indexTicket, type SearchParams } from '../services/search';

const SearchQueryParams = t.Object({
  q: t.String({ minLength: 1 }),
  semantic: t.Optional(t.Boolean()),
  status: t.Optional(t.String()),
  priority: t.Optional(t.String()),
  teamId: t.Optional(t.String()),
  productId: t.Optional(t.String()),
  dateFrom: t.Optional(t.String()),
  dateTo: t.Optional(t.String()),
  tags: t.Optional(t.String()), // Comma-separated
  excludeTags: t.Optional(t.String()), // Comma-separated
  page: t.Optional(t.Numeric()),
  pageSize: t.Optional(t.Numeric())
});

export const createSearchRoutes = (env: Bindings) =>
  new Elysia<'', false, WorkerSingleton>()
    // Main search endpoint
    .get('/search', async ({ store, query }) => {
      const user = store.decorator.user;
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

      const results = await searchTickets(
        store.db,
        env.VECTORIZE_INDEX,
        params
      );

      return results;
    })

    // Search suggestions / autocomplete
    .get('/search/suggestions', async ({ store, query }) => {
      const user = store.decorator.user;
      if (!user?.id) throw new Response('Unauthorized', { status: 401 });

      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'ticket.read');

      const prefix = query.q as string;
      if (!prefix || prefix.length < 2) {
        return { suggestions: [] };
      }

      const suggestions = await getSearchSuggestions(store.db, prefix);
      return { suggestions };
    })

    // Index a ticket (admin only, for manual reindexing)
    .post('/search/index/:ticketId', async ({ store, params }) => {
      const user = store.decorator.user;
      if (!user?.id) throw new Response('Unauthorized', { status: 401 });

      const ctx = await resolveContext(env, user);
      assertPermission(ctx, 'tenant.manage'); // SuperAdmin only

      if (!env.VECTORIZE_INDEX) {
        return { success: false, message: 'Vectorize not configured' };
      }

      const success = await indexTicket(
        store.db,
        env.VECTORIZE_INDEX,
        params.ticketId
      );

      return { success, ticketId: params.ticketId };
    })

    // Batch index tickets (admin only)
    .post(
      '/search/index/batch',
      async ({ store, body }) => {
        const user = store.decorator.user;
        if (!user?.id) throw new Response('Unauthorized', { status: 401 });

        const ctx = await resolveContext(env, user);
        assertPermission(ctx, 'tenant.manage'); // SuperAdmin only

        if (!env.VECTORIZE_INDEX) {
          return { success: false, message: 'Vectorize not configured', indexed: 0, failed: 0 };
        }

        let indexed = 0;
        let failed = 0;

        for (const ticketId of body.ticketIds) {
          try {
            const success = await indexTicket(store.db, env.VECTORIZE_INDEX, ticketId);
            if (success) indexed++;
            else failed++;
          } catch {
            failed++;
          }
        }

        return { success: true, indexed, failed };
      },
      {
        body: t.Object({
          ticketIds: t.Array(t.String())
        })
      }
    );
