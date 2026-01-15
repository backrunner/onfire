import { assertPermission } from '@onfire/shared/rbac';
import { searchTickets, getSearchSuggestions, indexTicket, type SearchParams } from '../../services/search';
import { createRouter } from '../../core/router';
import { handleResult, errorResult } from '../../core/route-utils';
import { resolveContext } from '../../core/context';
import { ok } from '../../core/response';

export const searchRoutes = () => {
  const router = createRouter();

  // GET /search
  router.get('/search', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'ticket.read');

    const query = c.req.query();
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

    const results = await searchTickets(db, c.env.VECTORIZE_INDEX, params);
    return c.json(ok(results));
  });

  // GET /search/suggestions
  router.get('/search/suggestions', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'ticket.read');

    const query = c.req.query();
    const prefix = query.q as string;

    if (!prefix || prefix.length < 2) {
      return c.json(ok({ suggestions: [] }));
    }

    const suggestions = await getSearchSuggestions(db, prefix);
    return c.json(ok({ suggestions }));
  });

  // POST /search/index/:ticketId
  router.post('/search/index/:ticketId', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'tenant.manage');

    const ticketId = c.req.param('ticketId');

    if (!c.env.VECTORIZE_INDEX) {
      return c.json(ok({ success: false, message: 'Vectorize not configured' }));
    }

    const success = await indexTicket(db, c.env.VECTORIZE_INDEX, ticketId);
    return c.json(ok({ success, ticketId }));
  });

  // POST /search/index/batch
  router.post('/search/index/batch', async (c) => {
    const db = c.get('db');
    const user = c.get('user');
    if (!user?.id) throw new Response('Unauthorized', { status: 401 });
    const ctx = await resolveContext(c.env, user);
    assertPermission(ctx, 'tenant.manage');

    const body = await c.req.json<{ ticketIds: string[] }>();

    if (!c.env.VECTORIZE_INDEX) {
      return c.json(ok({ success: false, message: 'Vectorize not configured', indexed: 0, failed: 0 }));
    }

    let indexed = 0;
    let failed = 0;

    for (const ticketId of body.ticketIds) {
      try {
        const success = await indexTicket(db, c.env.VECTORIZE_INDEX, ticketId);
        if (success) indexed++;
        else failed++;
      } catch {
        failed++;
      }
    }

    return c.json(ok({ success: true, indexed, failed }));
  });

  return router;
};
