import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, and, or, desc, count, sql, isNull } from "drizzle-orm";
import {
  tickets,
  history,
  products,
  tenants,
  categoryRoutes,
  customers,
  templates,
} from "@/drizzle/schema";
import { TicketStatus, TicketPriority } from "@/lib/types";
import { ok, err, badRequest } from "@/lib/api/response";
import { withCustomerAuth, parseBody, parseQuery } from "@/lib/api/handler";
import { computeInitialSlaDeadlines } from "@/lib/tickets/sla";
import { serializeTicketForCustomer } from "@/lib/tickets/serialize";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { enforceRateLimit } from "@/lib/rate-limit";
import { pickAssignee, derivePriority } from "@/services/allocation";
import { emitTicketEvent } from "@/services/ticket-events";
import {
  parseFormSchema,
  validateFormSubmission,
} from "@/lib/form-schema";

const listQuerySchema = z.object({
  status: z.enum(TicketStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const createTicketSchema = z.object({
  templateId: z.string().optional(),
  subject: z.string().min(1).max(500),
  content: z.string().min(1).max(50_000),
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
    items: rows.map(serializeTicketForCustomer),
    total,
    page: query.page,
    pageSize: query.pageSize,
  });
});

/**
 * POST /api/toc/tickets — submit a ticket.
 *
 * Routing: category (from metadata.category) → CategoryRoute → team,
 * falling back to the tenant default team; an agent is auto-assigned via
 * the load-balancing algorithm.
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
    return err("CAPTCHA verification failed", 400, captcha.errorCodes);
  }

  const product = await db.query.products.findFirst({
    where: eq(products.id, customer.productId),
  });
  if (!product) return err("Product not found", 404);

  if (body.templateId) {
    const template = await db.query.templates.findFirst({
      where: and(
        eq(templates.id, body.templateId),
        eq(templates.productId, product.id)
      ),
    });
    if (!template) throw badRequest("Template does not belong to this product");
    const formSchema = parseFormSchema(template.formSchema);
    if (!formSchema) throw badRequest("Template form configuration is invalid");
    const submissionErrors = validateFormSubmission(
      formSchema,
      body.metadata ?? {}
    );
    if (submissionErrors.length > 0) {
      throw badRequest("Template fields are invalid", submissionErrors);
    }
    let categories: unknown = [];
    try {
      categories = JSON.parse(template.categories);
    } catch {
      categories = [];
    }
    const allowedCategories = Array.isArray(categories)
      ? categories.filter((value): value is string => typeof value === "string")
      : [];
    const submittedCategory = body.metadata?.category;
    if (
      allowedCategories.length > 0 &&
      (typeof submittedCategory !== "string" ||
        !allowedCategories.includes(submittedCategory))
    ) {
      throw badRequest("A valid template category is required");
    }
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, product.tenantId),
  });
  if (!tenant) return err("Tenant not found", 404);

  // Resolve handling team: category route → tenant default
  let teamId = tenant.defaultTeamId;
  const category =
    typeof body.metadata?.category === "string" ? body.metadata.category : null;
  if (category) {
    const subcategory =
      typeof body.metadata?.subcategory === "string"
        ? body.metadata.subcategory.trim()
        : "";
    // Prefer an exact subcategory route, then fall back to the category-wide
    // route. Older rows may still contain NULL before migration 0009.
    const exactRoute = subcategory
      ? await db.query.categoryRoutes.findFirst({
          where: and(
            eq(categoryRoutes.productId, product.id),
            eq(categoryRoutes.category, category),
            eq(categoryRoutes.subcategory, subcategory)
          ),
        })
      : undefined;
    const route =
      exactRoute ??
      (await db.query.categoryRoutes.findFirst({
        where: and(
          eq(categoryRoutes.productId, product.id),
          eq(categoryRoutes.category, category),
          or(eq(categoryRoutes.subcategory, ""), isNull(categoryRoutes.subcategory))
        ),
      }));
    if (route) teamId = route.teamId;
  }
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
      customerId: customer.sub,
      customerEmail: customer.email ?? null,
      customerLevel: customer.level ?? null,
      templateId: body.templateId ?? null,
      metadata: body.metadata ? JSON.stringify(body.metadata) : null,
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
