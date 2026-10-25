import { and, desc, eq, gte, isNotNull, isNull, or, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/sqlite-core";
import { customers, filteredInputs, inboundEmails, products, tickets, users } from "@/drizzle/schema";
import type { AuthedContext } from "@/lib/api/handler";
import { assertProductAccess, assertTenantAccess, productScopeCondition } from "@/lib/api/scope";
import { badRequest, conflict, notFound } from "@/lib/api/response";
import { richHtmlToText, sanitizeRichHtml } from "@/lib/rich-text";
import { filteredInputContent } from "@/lib/filtered-input-content";
import { loadCustomerTicket } from "@/lib/tickets/customer-access";
import { createCustomerTicket, createTicketSchema } from "./customer-ticket";
import { addCustomerReply } from "./customer-reply";
import { releaseQuarantinedEmail } from "./email/inbound";

export type FilteredInputSource = "email" | "web";
export function parseFilteredInputSource(value: string): FilteredInputSource {
  if (value !== "email" && value !== "web") throw badRequest("Invalid filtered input source");
  return value;
}
export interface FilteredInputQuery { tenantId?: string; state?: "pending" | "released"; page: number; pageSize: number }

export async function listFilteredInputs(ctx: AuthedContext, query: FilteredInputQuery) {
  if (query.tenantId) await assertTenantAccess(ctx, query.tenantId);
  const scope = and(productScopeCondition(ctx), query.tenantId ? eq(products.tenantId, query.tenantId) : undefined);
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const web = ctx.db.select({
    id: filteredInputs.id, source: sql<FilteredInputSource>`'web'`.as("source"), productId: sql<string>`${products.id}`.as("product_id"), productName: sql<string>`${products.name}`.as("product_name"),
    sender: sql<string>`coalesce(${customers.email}, ${customers.externalId}, ${filteredInputs.customerId})`.as("sender"),
    subject: filteredInputs.subject, preview: sql<string>`substr(${filteredInputs.content}, 1, 180)`.as("preview"),
    kind: sql<"new" | "reply">`CASE WHEN ${filteredInputs.ticketId} IS NULL THEN 'new' ELSE 'reply' END`.as("kind"),
    state: sql<"pending" | "releasing" | "released">`CASE WHEN ${filteredInputs.releasedAt} IS NULL THEN 'pending' ELSE 'released' END`.as("state"),
    filterProvider: filteredInputs.filterProvider, filterVerdict: filteredInputs.filterVerdict,
    filterScore: filteredInputs.filterScore, filterReason: filteredInputs.filterReason,
    createdAt: filteredInputs.createdAt, releasedAt: filteredInputs.releasedAt,
    ticketId: filteredInputs.restoredTicketId, ticketNumber: tickets.number,
  }).from(filteredInputs).innerJoin(products, eq(products.id, filteredInputs.productId))
    .leftJoin(customers, and(eq(customers.id, filteredInputs.customerId), eq(customers.productId, products.id)))
    .leftJoin(tickets, and(eq(tickets.id, filteredInputs.restoredTicketId), eq(tickets.productId, products.id)))
    .where(and(scope, gte(filteredInputs.createdAt, since), query.state === "pending" ? isNull(filteredInputs.releasedAt) : query.state === "released" ? isNotNull(filteredInputs.releasedAt) : undefined));
  const mail = ctx.db.select({
    id: inboundEmails.id, source: sql<FilteredInputSource>`'email'`.as("source"), productId: sql<string>`${products.id}`.as("product_id"), productName: sql<string>`${products.name}`.as("product_name"),
    sender: inboundEmails.fromEmail,
    subject: sql<string>`coalesce(${inboundEmails.subject}, '')`.as("subject"), preview: sql<string>`substr(coalesce(${inboundEmails.bodyPlain}, ''), 1, 180)`.as("preview"),
    kind: sql<"new" | "reply">`CASE WHEN ${inboundEmails.candidateTicketId} IS NULL THEN 'new' ELSE 'reply' END`.as("kind"),
    state: sql<"pending" | "releasing" | "released">`CASE WHEN ${inboundEmails.releasedAt} IS NOT NULL THEN 'released' WHEN ${inboundEmails.processingStatus} = 'releasing' THEN 'releasing' ELSE 'pending' END`.as("state"),
    filterProvider: sql<string>`coalesce(${inboundEmails.filterProvider}, 'local')`.as("filter_provider"), filterVerdict: sql<string>`coalesce(${inboundEmails.filterVerdict}, 'spam')`.as("filter_verdict"),
    filterScore: inboundEmails.filterScore, filterReason: sql<string>`coalesce(${inboundEmails.filterReason}, '')`.as("filter_reason"),
    createdAt: inboundEmails.createdAt, releasedAt: inboundEmails.releasedAt,
    ticketId: inboundEmails.ticketId, ticketNumber: tickets.number,
  }).from(inboundEmails).innerJoin(products, eq(products.id, inboundEmails.productId))
    .leftJoin(tickets, and(eq(tickets.id, inboundEmails.ticketId), eq(tickets.productId, products.id)))
    .where(and(scope, gte(inboundEmails.createdAt, since),
      or(eq(inboundEmails.processingStatus, "quarantined"), eq(inboundEmails.processingStatus, "releasing"), isNotNull(inboundEmails.releasedAt)),
      query.state === "pending" ? isNull(inboundEmails.releasedAt) : query.state === "released" ? isNotNull(inboundEmails.releasedAt) : undefined));
  const combined = unionAll(web, mail).as("filtered");
  const [[total], items] = await ctx.db.batch([
    ctx.db.select({ total: sql<number>`count(*)`.as("total") }).from(combined),
    ctx.db.select().from(combined).orderBy(desc(combined.createdAt), desc(combined.source), desc(combined.id)).limit(query.pageSize).offset((query.page - 1) * query.pageSize),
  ]);
  return { items, total: total.total, page: query.page, pageSize: query.pageSize };
}

async function releaseActor(ctx: AuthedContext, userId: string | null) {
  if (!userId) return null;
  const actor = await ctx.db.query.users.findFirst({ where: eq(users.id, userId), columns: { displayName: true } });
  return actor?.displayName ?? userId;
}

export async function loadFilteredInput(ctx: AuthedContext, source: FilteredInputSource, id: string) {
  if (source === "email") {
    const row = await ctx.db.query.inboundEmails.findFirst({ where: eq(inboundEmails.id, id) });
    if (!row || (!row.releasedAt && !["quarantined", "releasing"].includes(row.processingStatus))) throw notFound("Filtered input not found");
    await assertProductAccess(ctx, row.productId);
    return { source, id, productId: row.productId, subject: row.subject ?? "", content: row.bodyPlain?.trim() || richHtmlToText(sanitizeRichHtml(row.bodyHtml ?? "")),
      ...filteredInputContent(row.bodyHtml), releasedByName: await releaseActor(ctx, row.releasedBy),
      metadata: null, ticketTypeId: row.releaseTicketTypeId, needsTicketType: !row.candidateTicketId,
      candidateTicketId: row.candidateTicketId, releasedAt: row.releasedAt, releasedBy: row.releasedBy, releaseReason: row.releaseReason,
      filterStage: row.filterStage, filterProvider: row.filterProvider, filterReason: row.filterReason, filterScore: row.filterScore };
  }
  const row = await ctx.db.query.filteredInputs.findFirst({ where: eq(filteredInputs.id, id) });
  if (!row) throw notFound("Filtered input not found");
  await assertProductAccess(ctx, row.productId);
  return { source, id, productId: row.productId, subject: row.subject, content: row.content || richHtmlToText(sanitizeRichHtml(row.contentHtml ?? "")),
    ...filteredInputContent(row.contentHtml), releasedByName: await releaseActor(ctx, row.releasedBy),
    metadata: row.metadata, ticketTypeId: row.ticketTypeId, needsTicketType: false,
    candidateTicketId: row.ticketId, releasedAt: row.releasedAt, releasedBy: row.releasedBy, releaseReason: row.releaseReason,
    filterStage: "admission", filterProvider: row.filterProvider, filterReason: row.filterReason, filterScore: row.filterScore };
}

export async function restoreFilteredInput(ctx: AuthedContext, source: FilteredInputSource, id: string, input: { reason: string; ticketTypeId?: string }) {
  const detail = await loadFilteredInput(ctx, source, id);
  if (source === "email") {
    let result;
    try { result = await releaseQuarantinedEmail(ctx.db, { emailId: id, actorId: ctx.user.id, ...input }); }
    catch (error) { throw badRequest(error instanceof Error ? error.message : "Release failed"); }
    if (!result.ticketId) throw conflict("This input is being restored. Refresh to check its status.");
    return restoredResult(ctx, detail.productId, result.ticketId, result.replyId ?? null);
  }
  const row = await ctx.db.query.filteredInputs.findFirst({ where: eq(filteredInputs.id, id) });
  if (!row) throw notFound("Filtered input not found");
  if (row.releasedAt && row.restoredTicketId) return restoredResult(ctx, row.productId, row.restoredTicketId, row.restoredReplyId);
  const customerRow = await ctx.db.query.customers.findFirst({ where: and(eq(customers.id, row.customerId), eq(customers.productId, row.productId)) });
  const product = await assertProductAccess(ctx, row.productId);
  if (!customerRow || customerRow.tenantId !== product.tenantId) throw notFound("Customer not found");
  const customer = { sub: customerRow.id, productId: product.id, tenantId: product.tenantId, email: customerRow.email ?? undefined, externalId: customerRow.externalId ?? undefined, level: customerRow.level ?? undefined };
  const release = { id, actorId: ctx.user.id, reason: input.reason };
  const language = row.language === "zh" ? "zh" : "en";
  try {
    if (row.ticketId) {
      const ticket = await loadCustomerTicket({ db: ctx.db, customer, params: {} }, row.ticketId);
      const result = await addCustomerReply(ctx.db, customer, ticket, { content: row.content, contentHtml: row.contentHtml ?? undefined }, language, release);
      return restoredResult(ctx, row.productId, row.ticketId, result.replyId);
    }
    const body = createTicketSchema.parse({ ticketTypeId: row.ticketTypeId, templateVersionId: row.templateVersionId, subject: row.subject, content: row.content, priority: row.priority ?? undefined, metadata: row.metadata ? JSON.parse(row.metadata) : undefined });
    const result = await createCustomerTicket(ctx.db, customer, body, language, release);
    return restoredResult(ctx, row.productId, result.ticketId, null);
  } catch (error) {
    // The deterministic ticket/reply ID and audit commit together. A racing retry
    // cannot insert a second record or emit events, and returns the committed result.
    const latest = await ctx.db.query.filteredInputs.findFirst({ where: eq(filteredInputs.id, id) });
    if (latest?.releasedAt && latest.restoredTicketId) return restoredResult(ctx, row.productId, latest.restoredTicketId, latest.restoredReplyId);
    throw error;
  }
}

async function restoredResult(ctx: AuthedContext, productId: string, ticketId: string, replyId: string | null) {
  const ticket = await ctx.db.query.tickets.findFirst({ where: and(eq(tickets.id, ticketId), eq(tickets.productId, productId)) });
  if (!ticket) throw notFound("Restored ticket no longer exists");
  return { ticketId, ticketNumber: ticket.number, replyId };
}

export type FilteredInputItem = Awaited<ReturnType<typeof listFilteredInputs>>["items"][number];
export type FilteredInputDetail = Awaited<ReturnType<typeof loadFilteredInput>>;
