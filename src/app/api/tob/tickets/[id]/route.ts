import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  tickets,
  replies,
  history,
  products,
  ticketTemplateVersions,
  ticketTypeInternalStates,
  ticketInternalStateValues,
} from "@/drizzle/schema";
import { TicketStatus } from "@/lib/types";
import { ok, notFound, badRequest, ApiError } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { assertTicketVisible } from "@/lib/api/scope";
import {
  serializeTicket,
  serializeHistory,
  serializeReplyForAgent,
} from "@/lib/tickets/serialize";
import { resolveUserNames, resolveCustomerExternalIds } from "@/lib/tickets/names";
import { isOpen } from "@/lib/tickets/state-machine";
import { emitTicketEvent } from "@/services/ticket-events";
import { prepareReplyEmailIntent } from "@/services/email/agent-outbox";
import { parseFormSchema } from "@/lib/form-schema";
import { serializeState } from "@/services/ticket-internal-states";
import { sanitizeRichHtml, richHtmlToText, richTextIsEmpty } from "@/lib/rich-text";
import { prepareReplyTranslation } from "@/services/ticket-translation";

const replySchema = z.object({
  content: z.string().max(20_000).default(""),
  /** Optional sanitized rich-text rendering of the reply. */
  contentHtml: z.string().max(100_000).optional(),
  internal: z.boolean().default(false),
});

export const GET = withAuth({ permission: "ticket.read" }, async (_req: NextRequest, ctx) => {
  const ticket = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ctx.params.id),
  });
  if (!ticket) throw notFound("Ticket not found");
  assertTicketVisible(ctx, ticket);

  const [replyRows, historyRows, templateVersion, internalStateRows, internalStateValues, product] = await Promise.all([
    ctx.db
      .select()
      .from(replies)
      .where(eq(replies.ticketId, ticket.id))
      .orderBy(replies.createdAt),
    ctx.db
      .select()
      .from(history)
      .where(eq(history.ticketId, ticket.id))
      .orderBy(history.createdAt),
    ticket.templateVersionId
      ? ctx.db.query.ticketTemplateVersions.findFirst({
          where: eq(ticketTemplateVersions.id, ticket.templateVersionId),
        })
      : undefined,
    ctx.db
      .select()
      .from(ticketTypeInternalStates)
      .where(eq(ticketTypeInternalStates.ticketTypeId, ticket.ticketTypeId))
      .orderBy(ticketTypeInternalStates.sortOrder, ticketTypeInternalStates.name),
    ctx.db
      .select()
      .from(ticketInternalStateValues)
      .where(eq(ticketInternalStateValues.ticketId, ticket.id)),
    ctx.db.query.products.findFirst({ where: eq(products.id, ticket.productId) }),
  ]);

  const valuesByState = new Map(internalStateValues.map((row) => [row.stateId, row]));
  const internalStates = internalStateRows
    .filter((state) => !state.archivedAt || valuesByState.has(state.id))
    .map((state) => ({
      ...serializeState(state),
      value: valuesByState.get(state.id)?.value ?? null,
      updatedAt: valuesByState.get(state.id)?.updatedAt ?? null,
      updatedBy: valuesByState.get(state.id)?.updatedBy ?? null,
    }));

  const serializedHistory = serializeHistory(historyRows);

  // Resolve every referenced user (assignee, reply senders, history actors,
  // assignees inside history snapshots) to a display name in one batch.
  const snapshotIds = serializedHistory.flatMap((h) => {
    const s = h.snapshot as
      | { newAssignee?: string; previousAssignee?: string | null }
      | undefined;
    return [s?.newAssignee, s?.previousAssignee ?? undefined];
  });
  const actors = await resolveUserNames(ctx.db, [
    ticket.assigneeId,
    ...replyRows.map((r) => r.senderId),
    ...historyRows.map((h) => h.actorId),
    ...snapshotIds,
  ]);

  const customerRefs = ticket.customerEmail
    ? {}
    : await resolveCustomerExternalIds(ctx.db, [ticket.customerId]);
  const customerLabel =
    ticket.customerEmail ??
    (ticket.customerId ? (customerRefs[ticket.customerId] ?? null) : null);

  const agentLanguage = product?.defaultLanguage ?? "en";
  const namedReplies = replyRows.map((r) => ({
    ...serializeReplyForAgent(r, agentLanguage),
    senderName: r.senderId ? (actors[r.senderId] ?? null) : null,
  }));
  const namedHistory = serializedHistory.map((h) => ({
    ...h,
    actorName: h.actorId ? (actors[h.actorId] ?? null) : null,
  }));

  const timeline = [
    ...namedHistory.map((h) => ({ type: "history" as const, ...h })),
    ...namedReplies.map((r) => ({ type: "reply" as const, ...r })),
  ].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

  return ok({
    ticket: {
      ...serializeTicket(ticket, agentLanguage),
      assigneeName: ticket.assigneeId
        ? (actors[ticket.assigneeId] ?? null)
        : null,
      customerLabel,
    },
    templateVersion: templateVersion
      ? {
          id: templateVersion.id,
          version: templateVersion.version,
          formSchema: parseFormSchema(templateVersion.formSchema),
          invalidatedAt: templateVersion.invalidatedAt,
        }
      : null,
    replies: namedReplies,
    history: namedHistory,
    timeline,
    actors,
    internalStates,
  });
});

/**
 * POST /api/tob/tickets/:id — agent reply (or internal note).
 * Internal notes never change ticket status and are invisible to customers.
 */
export const POST = withAuth({ permission: "ticket.write" }, async (req: NextRequest, ctx) => {
  const ticket = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ctx.params.id),
  });
  if (!ticket) throw notFound("Ticket not found");
  assertTicketVisible(ctx, ticket);

  const body = await parseBody(req, replySchema);

  if (!isOpen(ticket.status) && !body.internal) {
    throw badRequest("Cannot reply to a closed ticket");
  }

  // Rich text is re-sanitized server-side; a payload that sanitizes to
  // nothing is stored as plain text only.
  const contentHtml = body.contentHtml
    ? sanitizeRichHtml(body.contentHtml) || null
    : null;
  const content = body.content.trim() || (contentHtml ? richHtmlToText(contentHtml) : "");
  if (!content && !(contentHtml && !richTextIsEmpty(contentHtml))) {
    throw badRequest("Reply content is required");
  }

  // Internal notes are never translated; they carry no detected language
  // rather than borrowing the ticket's customer language.
  let translation: { detectedLanguage: string | null; translations: string | null } = {
    detectedLanguage: null,
    translations: null,
  };
  if (!body.internal) {
    const product = await ctx.db.query.products.findFirst({
      where: eq(products.id, ticket.productId),
    });
    if (!product) throw notFound("Product not found");
    try {
      translation = await prepareReplyTranslation(ctx.db, product, {
        content,
        contentHtml,
        targetLanguage: ticket.customerLanguage ?? product.defaultLanguage,
      });
    } catch (error) {
      console.error("Agent reply translation failed:", error);
      throw new ApiError(503, "Reply translation is temporarily unavailable");
    }
  }

  const now = new Date().toISOString();
  const replyId = crypto.randomUUID();
  const mailIntent = body.internal ? undefined : await prepareReplyEmailIntent(ctx.db, ticket.id, ticket.productId, replyId);

  const statements = [
    ctx.db.insert(replies).values({
      id: replyId,
      ticketId: ticket.id,
      senderId: ctx.user.id,
      content,
      contentHtml,
      detectedLanguage: translation.detectedLanguage,
      translations: translation.translations,
      internal: body.internal,
      createdAt: now,
    }),
    ctx.db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorId: ctx.user.id,
      action: body.internal ? "internal_note" : "agent_replied",
      createdAt: now,
    }),
  ] as const;

  if (body.internal) {
    await ctx.db.batch([...statements]);
  } else {
    await ctx.db.batch([
      ...statements,
      ...(mailIntent ? [mailIntent.statement] : []),
      ctx.db
        .update(tickets)
        .set({
          status: TicketStatus.Replied,
          // The public reply completes the first-reply SLA. Keep breach flags
          // as history, but stop the deadline from becoming active again.
          slaReplyDeadline: null,
          updatedAt: now,
        })
        .where(eq(tickets.id, ticket.id)),
    ]);
    emitTicketEvent(ctx.db, {
      type: "agent_replied",
      ticketId: ticket.id,
      agentId: ctx.user.id,
      replyId,
    });
  }

  const updated = await ctx.db.query.tickets.findFirst({
    where: eq(tickets.id, ticket.id),
  });

  return ok({
    ticket: updated ? serializeTicket(updated) : null,
    reply: { id: replyId, content, internal: body.internal, createdAt: now },
  });
});
