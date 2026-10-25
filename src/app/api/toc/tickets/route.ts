import { createCustomerTicket, createTicketSchema } from "@/services/customer-ticket";
import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and, or, isNull, desc, count, sql } from "drizzle-orm";
import {
  tickets,
  products,
} from "@/drizzle/schema";
import { TicketStatus } from "@/lib/types";
import { ok } from "@/lib/api/response";
import { localizedErr, requestLanguage } from "@/lib/api/error-messages";
import { withCustomerAuth, parseBody, parseQuery } from "@/lib/api/handler";
import { serializeTicketForCustomer } from "@/lib/tickets/serialize";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  requestedTocLanguage,
  resolveProductLanguage,
} from "@/lib/product-language";

const listQuerySchema = z.object({
  status: z.enum(TicketStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});


/**
 * GET /api/toc/tickets — list the authenticated customer's tickets.
 * Identity claims come from the verified JWT; mutable profile fields are
 * hydrated from the product-scoped customer row by withCustomerAuth.
 */
export const GET = withCustomerAuth(async (req: NextRequest, { db, customer }) => {
  const query = parseQuery(req, listQuerySchema);
  const product = await db.query.products.findFirst({
    where: eq(products.id, customer.productId),
  });
  const language = resolveProductLanguage(
    product ?? { defaultLanguage: "en", supportedLanguages: null },
    requestedTocLanguage(req),
    req.headers.get("accept-language")
  );

  // Ownership: canonical customerId link, with an email fallback for
  // tickets created before the link existed (or via inbound email).
  const identity = customer.email
    ? or(
        eq(tickets.customerId, customer.sub),
        and(isNull(tickets.customerId), sql`lower(${tickets.customerEmail}) = ${customer.email.toLowerCase()}`)
      )
    : eq(tickets.customerId, customer.sub);

  const conditions = [identity, eq(tickets.productId, customer.productId)];
  if (query.status) conditions.push(eq(tickets.status, query.status));
  const where = and(...conditions);

  const [{ total }] = await db
    .select({ total: count() })
    .from(tickets)
    .where(where);

  const rows = await db
    .select()
    .from(tickets)
    .where(where)
    .orderBy(desc(tickets.createdAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  return ok({
    items: rows.map((row) => serializeTicketForCustomer(row, language)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  });
});

/**
 * POST /api/toc/tickets — submit a ticket.
 *
 * Routing: selected ticket type → nearest ancestor route → tenant default.
 */
export const POST = withCustomerAuth(async (req: NextRequest, { db, customer }) => {
  await enforceRateLimit(
    db,
    req,
    "toc:create-ticket",
    { limit: 5, windowSeconds: 60 },
    customer.sub
  );

  const body = await parseBody(req, createTicketSchema);

  const captcha = await verifyTurnstileToken(
    body.turnstileToken,
    req.headers.get("cf-connecting-ip")
  );
  if (!captcha.success) {
    return localizedErr(req, "CAPTCHA verification failed", 400, captcha.errorCodes);
  }

  return ok(await createCustomerTicket(db, customer, body, { requested: requestedTocLanguage(req), accept: req.headers.get("accept-language"), errorLanguage: requestLanguage(req) }), 201);
});
