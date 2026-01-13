import { TicketStatus } from '@onfire/shared';
import { history, tickets } from '@onfire/shared/drizzle/schema';
import { eq, ne } from 'drizzle-orm';
import { createRouter } from '../../core/router';

export const taskRoutes = () => {
  const router = createRouter();

  router.post('/tasks/sla-scan', async (c) => {
    const authHeader = c.req.header('authorization')?.replace('Bearer ', '');
    const taskSecret = c.env.TASK_SECRET;
    if (taskSecret && authHeader !== taskSecret) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    const db = c.get('db');
    const now = new Date();
    const isoNow = now.toISOString();
    const rows = await db
      .select({
        id: tickets.id,
        status: tickets.status,
        slaAccept: tickets.slaAcceptDeadline,
        slaReply: tickets.slaReplyDeadline,
        acceptBreached: tickets.slaAcceptBreached,
        replyBreached: tickets.slaReplyBreached
      })
      .from(tickets)
      .where(ne(tickets.status, TicketStatus.Closed));
    for (const row of rows ?? []) {
      const acceptDue = row.slaAccept ? Date.parse(row.slaAccept) : undefined;
      const replyDue = row.slaReply ? Date.parse(row.slaReply) : undefined;
      const breaches: Array<{ field: 'accept' | 'reply' }> = [];
      if (!row.acceptBreached && acceptDue && now.getTime() > acceptDue && row.status === TicketStatus.New) breaches.push({ field: 'accept' });
      if (!row.replyBreached && replyDue && now.getTime() > replyDue && row.status !== TicketStatus.Closed) breaches.push({ field: 'reply' });
      if (breaches.length === 0) continue;
      const acceptFlag = row.acceptBreached || breaches.some((b) => b.field === 'accept');
      const replyFlag = row.replyBreached || breaches.some((b) => b.field === 'reply');
      await db
        .update(tickets)
        .set({ slaAcceptBreached: acceptFlag, slaReplyBreached: replyFlag, updatedAt: isoNow })
        .where(eq(tickets.id, row.id))
        .run();
      await db
        .insert(history)
        .values({
          id: crypto.randomUUID(),
          ticketId: row.id,
          actorId: null,
          action: 'sla_breach',
          snapshot: JSON.stringify({ accept: acceptFlag, reply: replyFlag }),
          createdAt: isoNow
        })
        .run();
    }
    return c.json({ ok: true });
  });

  return router;
};
