import { NextRequest } from "next/server";
import { z } from "zod";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { customers, tickets } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withAuth, parseQuery } from "@/lib/api/handler";
import { ticketScopeCondition } from "@/lib/api/scope";

const suggestQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
});

/**
 * GET /api/tob/search/suggest — lightweight autocomplete for the advanced
 * search box: recent matching ticket subjects and customer emails, scoped to
 * the caller's ticket visibility.
 */
export const GET = withAuth(
  { permission: "ticket.read" },
  async (req: NextRequest, ctx) => {
    const { q } = parseQuery(req, suggestQuerySchema);
    const scope = ticketScopeCondition(ctx);

    const rows = await ctx.db
      .select({
        id: tickets.id,
        subject: tickets.subject,
        customerEmail: tickets.customerEmail,
        customerExternalId: customers.externalId,
        status: tickets.status,
        updatedAt: tickets.updatedAt,
      })
      .from(tickets)
      .leftJoin(customers, eq(customers.id, tickets.customerId))
      .where(
        and(
          scope,
          or(
            sql`instr(lower(${tickets.subject}), lower(${q})) > 0`,
            sql`instr(lower(${tickets.customerEmail}), lower(${q})) > 0`,
            sql`instr(lower(${tickets.id}), lower(${q})) > 0`,
            sql`instr(lower(${customers.externalId}), lower(${q})) > 0`
          )
        )
      )
      .orderBy(desc(tickets.updatedAt))
      .limit(40);

    const needle = q.toLowerCase();
    const subjects: string[] = [];
    const customerValues: string[] = [];
    for (const row of rows) {
      if (
        subjects.length < 5 &&
        row.subject.toLowerCase().includes(needle) &&
        !subjects.includes(row.subject)
      ) {
        subjects.push(row.subject);
      }
      const email = row.customerEmail;
      if (
        email &&
        customerValues.length < 5 &&
        email.toLowerCase().includes(needle) &&
        !customerValues.includes(email)
      ) {
        customerValues.push(email);
      }
    }

    return ok({
      tickets: rows.slice(0, 8).map((row) => ({
        ...row,
        customerLabel: row.customerEmail ?? row.customerExternalId,
      })),
      subjects,
      customers: customerValues,
    });
  }
);
