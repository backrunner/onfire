import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { tickets, history, products, tenants, customers, ticketTypes, ticketTemplates, ticketTemplateVersions } from "@/drizzle/schema";
import { TicketStatus, TicketPriority } from "@/lib/types";
import { badRequest, conflict, notFound, ApiError } from "@/lib/api/response";
import { localizeApiErrorMessage } from "@/lib/api/error-messages";
import type { CustomerContext } from "@/lib/api/handler";
import type { Database } from "@/lib/db";
import { computeInitialSlaDeadlines } from "@/lib/tickets/sla";
import { pickAssignee, derivePriority } from "@/services/allocation";
import { emitTicketEvent } from "@/services/ticket-events";
import { loadTicketTypePath, resolveTicketTypeTeam, ticketTypePathSnapshot } from "@/services/ticket-types";
import { parseFormSchema, validateFormSubmission } from "@/lib/form-schema";
import { resolveProductLanguage } from "@/lib/product-language";
import { prepareTicketTranslation } from "@/services/ticket-translation";
import { enforceCustomerIntake } from "@/services/email/spam-filter";
import { releaseUpdate, type IntakeRelease } from "./intake-release";

export const createTicketSchema = z.object({
  ticketTypeId: z.string().min(1),
  templateVersionId: z.string().min(1),
  subject: z.string().trim().min(1).max(500),
  content: z.string().trim().min(1).max(50_000),
  priority: z.enum(TicketPriority).optional(),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .refine((value) => value === undefined || JSON.stringify(value).length <= 20_000, {
      message: "Metadata exceeds the 20 KB limit",
    }),
  turnstileToken: z.string().optional(),
});


export async function createCustomerTicket(db: Database, customer: CustomerContext["customer"], body: z.infer<typeof createTicketSchema>, language: "en" | "zh" | { requested: string | null; accept: string | null; errorLanguage: "en" | "zh" }, release?: IntakeRelease) {
  const product = await db.query.products.findFirst({
    where: eq(products.id, customer.productId),
  });
  if (!product) throw notFound("Product not found");

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
    const lang = typeof language === "string" ? language : language.errorLanguage;
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
  if (!tenant) throw notFound("Tenant not found");

  const teamId = await resolveTicketTypeTeam(db, typePath, tenant.defaultTeamId);
  if (!teamId) {
    throw badRequest("No team available to handle this ticket");
  }

  const customerLanguage = resolveProductLanguage(product, typeof language === "string" ? language : language.requested, typeof language === "string" ? undefined : language.accept);
  if (!release) await enforceCustomerIntake(db, { messageId: "", fromEmail: customer.email ?? "", toEmail: "", subject: body.subject, content: body.content, kind: "new" }, { tenantId: product.tenantId, productId: product.id }, {
    customerId: customer.sub, ticketTypeId: body.ticketTypeId, templateVersionId: body.templateVersionId,
    metadata: body.metadata ? JSON.stringify(body.metadata) : null, priority: body.priority, language: customerLanguage,
  });
  const now = new Date().toISOString();
  const ticketId = release?.id ?? crypto.randomUUID();
  const priority = body.priority ?? derivePriority(customer.level);
  const assignee = await pickAssignee(db, teamId);
  const sla = computeInitialSlaDeadlines(product, priority, Boolean(assignee), new Date(now));

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
      actorId: release?.actorId,
      snapshot: JSON.stringify({ source: "api", ...(release && { released: true, filteredInputId: release.id, reason: release.reason }) }),
      createdAt: now,
    }),
    db
      .update(customers)
      .set({ updatedAt: now })
      .where(eq(customers.id, customer.sub)),
    ...(release ? [releaseUpdate(db, release, ticketId, null, now)] : []),
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

  const createdTicket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId), columns: { number: true } });
  if (!createdTicket) throw new ApiError(500, "Created ticket not found");

  return { ticketId, ticketNumber: createdTicket.number, status: assignee ? TicketStatus.Processing : TicketStatus.New, assigned: Boolean(assignee) };
}
