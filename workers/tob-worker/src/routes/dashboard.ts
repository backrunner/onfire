import { Role, TicketPriority, TicketStatus } from '@onfire/shared';
import { tickets } from '@onfire/shared/drizzle/schema';
import { Elysia } from 'elysia';
import { and, inArray, eq } from 'drizzle-orm';
import { resolveContext } from '../core/context';
import type { Bindings, WorkerSingleton } from '../core/types';

export const createDashboardRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>({ prefix: '/dashboard' }).get('/summary', async ({ user, store }) => {
    const ctx = await resolveContext(env, user);
    const rows = await store.db
      .select({
        id: tickets.id,
        status: tickets.status,
        tenantId: tickets.tenantId,
        productId: tickets.productId,
        teamId: tickets.teamId,
        priority: tickets.priority,
        updatedAt: tickets.updatedAt,
        createdAt: tickets.createdAt,
        subject: tickets.subject,
        slaAcceptDeadline: tickets.slaAcceptDeadline,
        slaReplyDeadline: tickets.slaReplyDeadline,
        slaAcceptBreached: tickets.slaAcceptBreached,
        slaReplyBreached: tickets.slaReplyBreached
      })
      .from(tickets)
      .where(inArray(tickets.tenantId, ctx.tenantIds));

    const now = Date.now();
    const openStatuses = [TicketStatus.New, TicketStatus.Processing, TicketStatus.Replied, TicketStatus.Escalated];
    const scope =
      ctx.user.role === Role.SuperAdmin
        ? 'global'
        : ctx.user.role === Role.TenantAdmin
          ? 'tenant'
          : ctx.user.role === Role.ProductAdmin
            ? 'product'
            : ctx.user.role === Role.TeamAdmin
              ? 'team'
              : 'agent';

    const pending = rows.filter(
      (t) =>
        [TicketStatus.New, TicketStatus.Processing].includes(t.status as TicketStatus) &&
        (ctx.user.role === Role.Agent ? ctx.teamIds.includes(t.teamId as any) : true)
    );
    const escalated = rows.filter((t) => t.status === TicketStatus.Escalated);
    const overdue = rows.filter((t) => {
      if ([TicketStatus.Closed].includes(t.status as TicketStatus)) return false;
      const acceptDeadline = t.slaAcceptDeadline ? Date.parse(t.slaAcceptDeadline) : undefined;
      const replyDeadline = t.slaReplyDeadline ? Date.parse(t.slaReplyDeadline) : undefined;
      return (acceptDeadline && acceptDeadline < now) || (replyDeadline && replyDeadline < now) || t.slaAcceptBreached || t.slaReplyBreached;
    });

    const priorityWeight: Record<string, number> = { [TicketPriority.High]: 0, [TicketPriority.Medium]: 1, [TicketPriority.Low]: 2 };
    const sortByPriority = (list: any[]) =>
      [...list].sort((a, b) => {
        const wDiff = (priorityWeight[a.priority] ?? 3) - (priorityWeight[b.priority] ?? 3);
        if (wDiff !== 0) return wDiff;
        return (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt);
      });

    const topPending = sortByPriority(pending).slice(0, 10);
    const topOverdue = sortByPriority(overdue).slice(0, 10);
    const topEscalated = sortByPriority(escalated).slice(0, 10);

    return {
      scope,
      tenants: ctx.tenantIds.length,
      products: ctx.productIds.length,
      pendingTickets: pending.length,
      escalated: escalated.length,
      overdue: overdue.length,
      topPending,
      topOverdue,
      topEscalated
    };
  });
