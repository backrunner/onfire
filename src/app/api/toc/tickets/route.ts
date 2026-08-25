import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and, or, desc, count, sql } from "drizzle-orm";
import {
  tickets,
  history,
  products,
  tenants,
  customers,
  ticketTypes,
  ticketTemplates,
  ticketTemplateVersions,
} from "@/drizzle/schema";
import { TicketStatus, TicketPriority } from "@/lib/types";
import { ok, badRequest, conflict, ApiError } from "@/lib/api/response";
import { localizedErr, localizeApiErrorMessage, requestLanguage } from "@/lib/api/error-messages";
import { withCustomerAuth, parseBody, parseQuery } from "@/lib/api/handler";
import { computeInitialSlaDeadlines } from "@/lib/tickets/sla";
import { serializeTicketForCustomer } from "@/lib/tickets/serialize";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { enforceRateLimit } from "@/lib/rate-limit";
import { pickAssignee, derivePriority } from "@/services/allocation";
import { emitTicketEvent } from "@/services/ticket-events";
import {
  loadTicketTypePath,
  resolveTicketTypeTeam,
  ticketTypePathSnapshot,
} from "@/services/ticket-types";
import {
  parseFormSchema,
  validateFormSubmission,
} from "@/lib/form-schema";
import {
  requestedTocLanguage,
  resolveProductLanguage,
} from "@/lib/product-language";
import { prepareTicketTranslation } from "@/services/ticket-translation";

const listQuerySchema = z.object({
  status: z.enum(TicketStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const createTicketSchema = z.object({
  ticketTypeId: z.string().min(1),
  templateVersionId: z.string().min(1),
  subject: z.string().trim().min(1).max(500),
  content: z.string().trim().min(1).max(50_000),
  priority: z.enum(TicketPriority).optional(),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .refine((value) => JSON.stringify(value).length <= 20_000, {
      message: "Metadata exceeds the 20 KB limit",
    }),
  turnstileToken: z.string().optional(),
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
        sql`lower(${tickets.customerEmail}) = ${customer.email.toLowerCase()}`
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

  const product = await db.query.products.findFirst({
    where: eq(products.id, customer.productId),
  });
  if (!product) return localizedErr(req, "Product not found", 404);

  const ticketType = await db.query.ticketTypes.findFirst({
    where: and(
      eq(ticketTypes.id, body.ticketTypeId),
      eq(ticketTypes.productId, product.id)
    ),
  });
  if (!ticketType || ticketType.archivedAt || ticketType.systemKey) {
    throw badRequest("Ticket type is not available");
  }
  const template = await db.query.ticketTemplates.findFirst({
    where: eq(ticketTemplates.ticketTypeId, ticketType.id),
  });
  const version = await db.query.ticketTemplateVersions.findFirst({
    where: eq(ticketTemplateVersions.id, body.templateVersionId),
  });
  if (!template || template.archivedAt || !version || version.templateId !== template.id) {
    throw badRequest("Template version does not belong to this ticket type");
  }
  if (version.invalidatedAt) {
    throw conflict("Template version has been invalidated");
  }
  const formSchema = parseFormSchema(version.formSchema);
  if (!formSchema) throw badRequest("Template form configuration is invalid");
  const submissionErrors = validateFormSubmission(formSchema, body.metadata ?? {});
  if (submissionErrors.length > 0) {
    // The submission validator emits English source messages; translate the
    // per-field messages so the customer sees them in their language.
    const lang = requestLanguage(req);
    throw badRequest(
      "Template fields are invalid",
      submissionErrors.map((error) => ({
        ...error,
        message: localizeApiErrorMessage(error.message, lang),
      }))
    );
  }
  const typePath = await loadTicketTypePath(db, ticketType);
  if (typePath.some((item) => item.archivedAt)) {
    throw badRequest("Ticket type path is archived");
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, product.tenantId),
  });
  if (!tenant) return localizedErr(req, "Tenant not found", 404);

  const teamId = await resolveTicketTypeTeam(db, typePath, tenant.defaultTeamId);
  if (!teamId) {
    throw badRequest("No team available to handle this ticket");
  }

  const now = new Date().toISOString();
  const ticketId = crypto.randomUUID();
  const priority = body.priority ?? derivePriority(customer.level);
  const assignee = await pickAssignee(db, teamId);
  const sla = computeInitialSlaDeadlines(
    product,
    priority,
    Boolean(assignee),
    new Date(now)
  );
  const customerLanguage = resolveProductLanguage(
    product,
    requestedTocLanguage(req),
    req.headers.get("accept-language")
  );
  let preparedTranslation;
  try {
    preparedTranslation = await prepareTicketTranslation(db, product, {
      subject: body.subject,
      content: body.content,
      sourceLanguage: customerLanguage,
    });
  } catch (error) {
    console.error("Ticket intake translation failed:", error);
    throw new ApiError(503, "Ticket translation is temporarily unavailable");
  }

  await db.batch([
    db.insert(tickets).values({
      id: ticketId,
      tenantId: product.tenantId,
      productId: product.id,
      teamId,
      assigneeId: assignee?.id ?? null,
      status: assignee ? TicketStatus.Processing : TicketStatus.New,
      priority,
      subject: body.subject,
      content: body.content,
      subjectTranslations: preparedTranslation.subjectTranslations,
      contentTranslations: preparedTranslation.contentTranslations,
      customerId: customer.sub,
      customerEmail: customer.email ?? null,
      customerLevel: customer.level ?? null,
      ticketTypeId: ticketType.id,
      templateVersionId: version.id,
      ticketTypePath: JSON.stringify(ticketTypePathSnapshot(typePath)),
      templateId: null,
      metadata: body.metadata ? JSON.stringify(body.metadata) : null,
      customerLanguage: preparedTranslation.customerLanguage,
      ...sla,
      source: "api",
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId,
      action: "created",
      snapshot: JSON.stringify({ source: "api" }),
      createdAt: now,
    }),
    db
      .update(customers)
      .set({ updatedAt: now })
      .where(eq(customers.id, customer.sub)),
  ]);

  emitTicketEvent(db, {
    type: "ticket_created",
    ticketId,
    customerEmail: customer.email,
  });
  if (assignee) {
    emitTicketEvent(db, {
      type: "ticket_assigned",
      ticketId,
      agentId: assignee.id,
    });
  }

  return ok(
    {
      ticketId,
      status: assignee ? TicketStatus.Processing : TicketStatus.New,
      assigned: Boolean(assignee),
    },
    201
  );
});
