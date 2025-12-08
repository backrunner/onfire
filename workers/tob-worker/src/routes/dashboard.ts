import { TicketStatus } from '@onfire/shared';
import { tickets } from '@onfire/shared/drizzle/schema';
import { Elysia } from 'elysia';
import { and, inArray, eq } from 'drizzle-orm';
import { resolveContext } from '../core/context';
import type { Bindings } from '../core/types';

export const createDashboardRoutes = (env: Bindings) =>
  new Elysia({ prefix: '/dashboard' }).get('/summary', async ({ user, store }) => {
    const ctx = await resolveContext(env, user);
    const rows = await store.db
      .select({
        id: tickets.id,
        status: tickets.status,
        tenantId: tickets.tenantId,
        slaAcceptDeadline: tickets.slaAcceptDeadline,
        slaReplyDeadline: tickets.slaReplyDeadline
      })
      .from(tickets)
      .where(inArray(tickets.tenantId, ctx.tenantIds));

    const now = Date.now();
    const pending = rows.filter((t) => [TicketStatus.New, TicketStatus.Processing].includes(t.status as TicketStatus));
    const escalated = rows.filter((t) => t.status === TicketStatus.Escalated);
    const overdue = rows.filter((t) => {
      if ([TicketStatus.Closed].includes(t.status as TicketStatus)) return false;
      const acceptDeadline = t.slaAcceptDeadline ? Date.parse(t.slaAcceptDeadline) : undefined;
      const replyDeadline = t.slaReplyDeadline ? Date.parse(t.slaReplyDeadline) : undefined;
      return (acceptDeadline && acceptDeadline < now) || (replyDeadline && replyDeadline < now);
    });

    return {
      tenants: ctx.tenantIds.length,
      products: ctx.productIds.length,
      pendingTickets: pending.length,
      escalated: escalated.length,
      overdue: overdue.length
    };
  });
