import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Database } from "@/lib/db";
import { sanitizeRichHtml } from "@/lib/rich-text";
import {
  emailConfigs,
  history,
  inboundEmails,
  outboundEmails,
  products,
  replies,
  tenants,
  ticketTypes,
  tickets,
  type InboundEmailProvider,
  type InboundEmailRow,
  type TicketTypeRow,
} from "@/drizzle/schema";
import { TicketPriority, TicketStatus } from "@/lib/types";
import { checkRateLimit } from "@/lib/rate-limit";
import { computeInitialSlaDeadlines } from "@/lib/tickets/sla";
import { upsertCustomerIdentity } from "@/lib/auth/customer-record";
import { pickAssignee } from "@/services/allocation";
import {
  classifyInboundEmail,
  shouldRejectEmail,
  type EmailClassification,
  type EmailTicketTypeCandidate,
} from "@/services/ai/email-filter";
import { emitTicketEvent } from "@/services/ticket-events";
import {
  ensureUnclassifiedType,
  listProductTypeTemplates,
  loadCurrentTemplateVersion,
  loadTicketTypePath,
  resolveTicketTypeTeam,
  ticketTypePathSnapshot,
} from "@/services/ticket-types";
import {
  resolveSpamFilterConfig,
  runExternalSpamFilter,
} from "./spam-filter";

export interface InboundEmailPayload {
  provider?: InboundEmailProvider;
  fromEmail: string;
  fromName?: string;
  toEmail: string;
  subject: string;
  bodyPlain?: string;
  bodyHtml?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  spfResult?: string;
  dkimResult?: boolean;
  isSpam?: boolean;
  autoSubmitted?: string;
  precedence?: string;
  listId?: string;
  returnPath?: string;
}

export interface ProcessResult {
  success: boolean;
  action:
    | "ticket_created"
    | "reply_added"
    | "quarantined"
    | "rejected"
    | "duplicate"
    | "error";
  ticketId?: string;
  replyId?: string;
  reason?: string;
}

interface StoredEmailContext {
  row: InboundEmailRow;
  content: string;
  /** Sanitized rich-text rendering of the HTML part, when present. */
  contentHtml: string | null;
  product: typeof products.$inferSelect;
  tenant: typeof tenants.$inferSelect;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

async function quarantine(
  db: Database,
  emailId: string,
  input: {
    stage: string;
    provider?: string;
    verdict?: "allow" | "suspect" | "spam";
    score?: number;
    reason: string;
    result?: unknown;
    candidateTicketId?: string | null;
  }
): Promise<ProcessResult> {
  await db
    .update(inboundEmails)
    .set({
      processingStatus: "quarantined",
      filterStage: input.stage,
      filterProvider: input.provider ?? null,
      filterVerdict: input.verdict ?? "spam",
      filterScore: input.score ?? null,
      filterReason: input.reason,
      filterResult: input.result === undefined ? null : JSON.stringify(input.result),
      candidateTicketId: input.candidateTicketId ?? null,
      processedAt: new Date().toISOString(),
    })
    .where(eq(inboundEmails.id, emailId));
  return { success: false, action: "quarantined", reason: input.reason };
}

async function resolveReplyTicketId(
  db: Database,
  productId: string,
  fromEmail: string,
  subject: string,
  inReplyTo?: string | null,
  references?: string | null
): Promise<string | null> {
  const threadIds = extractThreadMessageIds(inReplyTo ?? undefined, references ?? undefined);
  const threadMatches: Array<{ ticketId: string | null; createdAt: string }> = [];
  if (threadIds.length > 0) {
    const sent = await db
      .select({
        ticketId: outboundEmails.ticketId,
        createdAt: outboundEmails.createdAt,
      })
      .from(outboundEmails)
      .where(
        and(
          eq(outboundEmails.productId, productId),
          eq(outboundEmails.status, "sent"),
          isNotNull(outboundEmails.ticketId),
          inArray(outboundEmails.providerMessageId, threadIds)
        )
      )
      .orderBy(desc(outboundEmails.createdAt))
      .limit(10);
    const received = await db
      .select({
        ticketId: inboundEmails.ticketId,
        createdAt: inboundEmails.createdAt,
      })
      .from(inboundEmails)
      .where(
        and(
          eq(inboundEmails.productId, productId),
          eq(inboundEmails.processingStatus, "processed"),
          isNotNull(inboundEmails.ticketId),
          inArray(inboundEmails.messageId, threadIds)
        )
      )
      .orderBy(desc(inboundEmails.createdAt))
      .limit(10);
    threadMatches.push(...sent, ...received);
  }

  const candidateIds = threadMatches
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((match) => match.ticketId)
    .filter((id): id is string => Boolean(id));
  const marker = subject.match(/\[Ticket\s+#([a-zA-Z0-9-]+)\]/i)?.[1];
  if (marker) candidateIds.push(marker);
  const uniqueIds = [...new Set(candidateIds)];
  if (uniqueIds.length === 0) return null;

  const matchingTickets = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(
      and(
        eq(tickets.productId, productId),
        inArray(tickets.id, uniqueIds),
        sql`lower(${tickets.customerEmail}) = ${fromEmail.toLowerCase()}`
      )
    );
  const validIds = new Set(matchingTickets.map((ticket) => ticket.id));
  return uniqueIds.find((id) => validIds.has(id)) ?? null;
}

async function addEmailReply(
  db: Database,
  context: StoredEmailContext,
  ticketId: string,
  release?: { actorId: string; reason: string }
): Promise<ProcessResult | null> {
  const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, ticketId) });
  if (
    !ticket ||
    ticket.productId !== context.product.id ||
    ticket.customerEmail?.toLowerCase() !== context.row.fromEmail.toLowerCase()
  ) {
    return null;
  }
  if (ticket.status === TicketStatus.Closed) {
    if (release) throw new Error("Closed tickets do not accept released replies");
    return quarantine(db, context.row.id, {
      stage: "thread",
      reason: "Closed tickets do not accept replies",
      candidateTicketId: ticket.id,
    });
  }
  const now = new Date().toISOString();
  const replyId = crypto.randomUUID();
  const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
    db.insert(replies).values({
      id: replyId,
      ticketId: ticket.id,
      senderEmail: context.row.fromEmail,
      content: context.content,
      contentHtml: context.contentHtml,
      source: "email",
      sourceEmailId: context.row.id,
      createdAt: now,
    }),
    db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId: ticket.id,
      actorId: release?.actorId ?? null,
      action: "customer_replied",
      snapshot: JSON.stringify({ source: "email", released: Boolean(release) }),
      createdAt: now,
    }),
    db
      .update(inboundEmails)
      .set({
        processingStatus: "processed",
        ticketId: ticket.id,
        replyId,
        processedAt: now,
        ...(release && {
          releasedAt: now,
          releasedBy: release.actorId,
          releaseReason: release.reason,
        }),
      })
      .where(eq(inboundEmails.id, context.row.id)),
  ];
  if (ticket.status === TicketStatus.Replied) {
    statements.push(
      db
        .update(tickets)
        .set({ status: TicketStatus.Processing, slaReplyDeadline: null, updatedAt: now })
        .where(eq(tickets.id, ticket.id))
    );
  }
  await db.batch(statements);
  emitTicketEvent(db, {
    type: "customer_replied",
    ticketId: ticket.id,
    agentId: ticket.assigneeId ?? undefined,
    customerEmail: context.row.fromEmail,
  });
  return { success: true, action: "reply_added", ticketId: ticket.id, replyId };
}

function buildTypeCandidates(
  rows: Awaited<ReturnType<typeof listProductTypeTemplates>>
): { candidates: EmailTicketTypeCandidate[]; versionsByType: Map<string, string> } {
  const byId = new Map(rows.types.map((type) => [type.id, type]));
  const versionsById = new Map(rows.versions.map((version) => [version.id, version]));
  const versionsByType = new Map<string, string>();
  const templatesByType = new Map(rows.templates.map((template) => [template.ticketTypeId, template]));
  const pathOf = (type: TicketTypeRow) => {
    const names = [type.name];
    let parentId = type.parentId;
    const seen = new Set([type.id]);
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent || parent.archivedAt) break;
      names.unshift(parent.name);
      parentId = parent.parentId;
    }
    return names.join(" / ");
  };
  const candidates = rows.types.flatMap((type) => {
    if (type.archivedAt || type.systemKey) return [];
    const template = templatesByType.get(type.id);
    const version = template?.currentVersionId
      ? versionsById.get(template.currentVersionId)
      : undefined;
    if (!template || template.archivedAt || !version || version.invalidatedAt) return [];
    versionsByType.set(type.id, version.id);
    return [{ id: type.id, path: pathOf(type), description: type.description }];
  });
  return { candidates, versionsByType };
}

async function createEmailTicket(
  db: Database,
  context: StoredEmailContext,
  type: TicketTypeRow,
  templateVersionId: string | null,
  analysis: EmailClassification | null,
  release?: { actorId: string; reason: string }
): Promise<ProcessResult> {
  const path = await loadTicketTypePath(db, type);
  const teamId = await resolveTicketTypeTeam(db, path, context.tenant.defaultTeamId);
  if (!teamId) throw new Error("No ticket type route or tenant default team is configured");
  const customer = await upsertCustomerIdentity(db, context.product, {
    email: context.row.fromEmail,
  });
  const now = new Date().toISOString();
  const ticketId = crypto.randomUUID();
  const assignee = await pickAssignee(db, teamId);
  const priority = TicketPriority.Medium;
  const sla = computeInitialSlaDeadlines(
    context.product,
    priority,
    Boolean(assignee),
    new Date(now)
  );
  const analysisJson = analysis ? JSON.stringify(analysis) : null;
  await db.batch([
    db.insert(tickets).values({
      id: ticketId,
      tenantId: context.product.tenantId,
      productId: context.product.id,
      teamId,
      assigneeId: assignee?.id ?? null,
      status: assignee ? TicketStatus.Processing : TicketStatus.New,
      priority,
      subject: context.row.subject || "No Subject",
      content: context.content,
      customerId: customer.id,
      customerEmail: context.row.fromEmail,
      customerLevel: customer.level ?? null,
      ticketTypeId: type.id,
      templateVersionId,
      ticketTypePath: JSON.stringify(ticketTypePathSnapshot(path)),
      source: "email",
      sourceEmailId: context.row.id,
      ...(analysis && {
        aiScreeningStatus: "completed" as const,
        aiScreeningResult: analysisJson,
        aiExtractedIssues: JSON.stringify(analysis.issues),
        aiKeywords: JSON.stringify(analysis.keywords),
      }),
      ...sla,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId,
      actorId: release?.actorId ?? null,
      action: "created",
      snapshot: JSON.stringify({ source: "email", released: Boolean(release) }),
      createdAt: now,
    }),
    db
      .update(inboundEmails)
      .set({
        processingStatus: "processed",
        ticketId,
        processedAt: now,
        ...(release && {
          releasedAt: now,
          releasedBy: release.actorId,
          releaseReason: release.reason,
          releaseTicketTypeId: type.id,
        }),
      })
      .where(eq(inboundEmails.id, context.row.id)),
  ]);
  emitTicketEvent(db, {
    type: "ticket_created",
    ticketId,
    customerEmail: context.row.fromEmail,
    aiPrescreened: Boolean(analysis),
  });
  if (assignee) {
    emitTicketEvent(db, { type: "ticket_assigned", ticketId, agentId: assignee.id });
  }
  return { success: true, action: "ticket_created", ticketId };
}

async function loadStoredContext(db: Database, row: InboundEmailRow): Promise<StoredEmailContext> {
  const product = await db.query.products.findFirst({ where: eq(products.id, row.productId) });
  if (!product) throw new Error("Product not found");
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, product.tenantId) });
  if (!tenant) throw new Error("Tenant not found");
  const content = row.bodyPlain?.trim() || stripHtml(row.bodyHtml || "");
  // Sanitized HTML preserves customer formatting and hosted inline images;
  // cid: attachment images are filtered out by the sanitizer.
  const contentHtml = row.bodyHtml ? sanitizeRichHtml(row.bodyHtml) || null : null;
  return { row, content, contentHtml, product, tenant };
}

export async function processInboundEmail(
  db: Database,
  payload: InboundEmailPayload
): Promise<ProcessResult> {
  const normalizedFrom = payload.fromEmail.trim().toLowerCase();
  const normalizedTo = payload.toEmail.trim().toLowerCase();
  const normalizedMessageId = payload.messageId?.trim().slice(0, 998);
  const normalizedSubject = payload.subject.replace(/[\r\n]+/g, " ").trim().slice(0, 998);
  const config = await db.query.emailConfigs.findFirst({
    where: sql`lower(${emailConfigs.inboundAddress}) = ${normalizedTo}`,
  });
  if (!config || !config.inboundEnabled) {
    return { success: false, action: "rejected", reason: "Inbound email is not configured" };
  }
  if (payload.provider && config.inboundProvider !== payload.provider) {
    return { success: false, action: "rejected", reason: "Inbound provider mismatch" };
  }

  let reclaim: InboundEmailRow | undefined;
  if (normalizedMessageId) {
    const existing = await db.query.inboundEmails.findFirst({
      where: and(
        eq(inboundEmails.productId, config.productId),
        eq(inboundEmails.messageId, normalizedMessageId)
      ),
    });
    const stale = existing?.processingStatus === "pending" &&
      Date.now() - new Date(existing.createdAt).getTime() > 5 * 60_000;
    if (existing && existing.processingStatus !== "error" && !stale) {
      return {
        success: true,
        action: "duplicate",
        ticketId: existing.ticketId ?? undefined,
        replyId: existing.replyId ?? undefined,
      };
    }
    reclaim = existing;
  }

  const now = new Date().toISOString();
  const content = payload.bodyPlain?.trim() || stripHtml(payload.bodyHtml || "");
  const emailId = reclaim?.id ?? crypto.randomUUID();
  const inboundValues = {
      id: emailId,
      productId: config.productId,
      messageId: normalizedMessageId || crypto.randomUUID(),
      provider: config.inboundProvider || "generic",
      fromEmail: normalizedFrom,
      fromName: payload.fromName || null,
      toEmail: normalizedTo,
      subject: normalizedSubject || null,
      bodyPlain: payload.bodyPlain?.trim() || null,
      bodyHtml: payload.bodyHtml || null,
      inReplyTo: payload.inReplyTo || null,
      references: payload.references || null,
      spfResult: payload.spfResult || null,
      dkimResult: payload.dkimResult ?? null,
      isSpam: payload.isSpam ?? false,
      autoSubmitted: payload.autoSubmitted || null,
      precedence: payload.precedence || null,
      listId: payload.listId || null,
      returnPath: payload.returnPath || null,
      processingStatus: "pending",
      filterResult: null,
      filterStage: null,
      filterProvider: null,
      filterVerdict: null,
      filterScore: null,
      filterReason: null,
      candidateTicketId: null,
      errorMessage: null,
      processedAt: null,
      createdAt: now,
  } as const;
  const inserted = reclaim
    ? await db
        .update(inboundEmails)
        .set(inboundValues)
        .where(
          and(
            eq(inboundEmails.id, reclaim.id),
            eq(inboundEmails.processingStatus, reclaim.processingStatus),
            eq(inboundEmails.createdAt, reclaim.createdAt)
          )
        )
        .returning({ id: inboundEmails.id })
    : await db
        .insert(inboundEmails)
        .values(inboundValues)
        .onConflictDoNothing()
        .returning({ id: inboundEmails.id });
  if (inserted.length === 0) return { success: true, action: "duplicate" };

  try {
    const row = await db.query.inboundEmails.findFirst({ where: eq(inboundEmails.id, emailId) });
    if (!row) throw new Error("Inbound email log was not created");
    const context = await loadStoredContext(db, row);
    if (!content) return quarantine(db, emailId, { stage: "local", reason: "Email body is empty" });
    if (payload.isSpam) return quarantine(db, emailId, { stage: "local", reason: "Email marked as spam by provider" });
    if (config.aiFilterStrictness === "high") {
      if (payload.spfResult && payload.spfResult.toLowerCase() !== "pass") {
        return quarantine(db, emailId, { stage: "local", reason: `SPF check failed: ${payload.spfResult}` });
      }
      if (payload.dkimResult === false) return quarantine(db, emailId, { stage: "local", reason: "DKIM check failed" });
    }
    const autoSubmitted = payload.autoSubmitted?.toLowerCase();
    const precedence = payload.precedence?.toLowerCase();
    if ((autoSubmitted && autoSubmitted !== "no") || payload.listId || ["bulk", "junk", "list"].includes(precedence ?? "")) {
      return quarantine(db, emailId, { stage: "local", reason: "Automated or mailing-list message" });
    }
    if (normalizedFrom.startsWith("mailer-daemon@") || payload.returnPath?.trim() === "<>") {
      return quarantine(db, emailId, { stage: "local", reason: "Bounce message" });
    }
    const senderRate = await checkRateLimit(
      db,
      `inbound-sender:${config.productId}:${normalizedFrom}`,
      { limit: 20, windowSeconds: 600 }
    );
    if (!senderRate.allowed) return quarantine(db, emailId, { stage: "local", reason: "Sender rate limit exceeded" });

    const replyTicketId = await resolveReplyTicketId(
      db,
      config.productId,
      normalizedFrom,
      normalizedSubject,
      payload.inReplyTo,
      payload.references
    );
    if (replyTicketId) {
      await db
        .update(inboundEmails)
        .set({ candidateTicketId: replyTicketId })
        .where(eq(inboundEmails.id, emailId));
      context.row.candidateTicketId = replyTicketId;
    }

    const external = await resolveSpamFilterConfig(db, context.tenant.id);
    if (external) {
      try {
        const verdict = await runExternalSpamFilter(external, {
          messageId: row.messageId,
          fromEmail: normalizedFrom,
          toEmail: normalizedTo,
          subject: normalizedSubject,
          content,
          spfResult: payload.spfResult,
          dkimResult: payload.dkimResult,
          autoSubmitted: payload.autoSubmitted,
          precedence: payload.precedence,
          listId: payload.listId,
          returnPath: payload.returnPath,
        });
        if (verdict.verdict === "spam") {
          return quarantine(db, emailId, {
            stage: "external",
            provider: verdict.provider,
            verdict: verdict.verdict,
            score: verdict.score,
            reason: verdict.reason || "External service classified the message as spam",
            result: verdict,
            candidateTicketId: replyTicketId,
          });
        }
      } catch (error) {
        console.error("External spam filter failed; continuing to AI", error);
        await db
          .update(inboundEmails)
          .set({ filterResult: JSON.stringify({ externalError: error instanceof Error ? error.message : String(error) }) })
          .where(eq(inboundEmails.id, emailId));
      }
    }

    if (replyTicketId) {
      const reply = await addEmailReply(db, context, replyTicketId);
      if (reply) return reply;
    }

    const typeRows = await listProductTypeTemplates(db, context.product.id);
    const { candidates, versionsByType } = buildTypeCandidates(typeRows);
    const analysis = config.aiFilterEnabled
      ? await classifyInboundEmail(
          db,
          { fromEmail: normalizedFrom, subject: normalizedSubject, content },
          candidates,
          { tenantId: context.tenant.id, productId: context.product.id }
        )
      : null;
    if (analysis && shouldRejectEmail(analysis, config.aiFilterStrictness ?? "medium")) {
      return quarantine(db, emailId, {
        stage: "ai",
        provider: "prescreening",
        verdict: "spam",
        score: analysis.confidence,
        reason: analysis.reason || "AI classified the message as spam or non-support",
        result: analysis,
      });
    }

    let selectedType: TicketTypeRow | undefined;
    let templateVersionId: string | null = null;
    if (analysis?.ticketTypeId && analysis.typeConfidence >= 0.7) {
      selectedType = typeRows.types.find(
        (type) => type.id === analysis.ticketTypeId && !type.archivedAt && !type.systemKey
      );
      templateVersionId = selectedType ? versionsByType.get(selectedType.id) ?? null : null;
      if (!templateVersionId) selectedType = undefined;
    }
    if (!selectedType) selectedType = await ensureUnclassifiedType(db, context.product.id);
    return await createEmailTicket(db, context, selectedType, templateVersionId, analysis);
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 2000) : "Unknown error";
    console.error(JSON.stringify({ event: "inbound_email_pipeline_failed", emailId, productId: config.productId, error: detail }));
    await db
      .update(inboundEmails)
      .set({ processingStatus: "error", errorMessage: detail, processedAt: new Date().toISOString() })
      .where(eq(inboundEmails.id, emailId));
    return { success: false, action: "error", reason: detail };
  }
}

export async function releaseQuarantinedEmail(
  db: Database,
  input: { emailId: string; ticketTypeId?: string; actorId: string; reason: string }
): Promise<ProcessResult> {
  const row = await db.query.inboundEmails.findFirst({ where: eq(inboundEmails.id, input.emailId) });
  if (!row) throw new Error("Inbound email not found");
  if (row.processingStatus === "processed" && row.releasedAt) {
    return {
      success: true,
      action: row.replyId ? "reply_added" : "ticket_created",
      ticketId: row.ticketId ?? undefined,
      replyId: row.replyId ?? undefined,
    };
  }
  if (row.processingStatus !== "quarantined") throw new Error("Inbound email is not quarantined");
  const context = await loadStoredContext(db, row);
  const release = { actorId: input.actorId, reason: input.reason };
  const candidateTicketId = row.candidateTicketId ??
    (await resolveReplyTicketId(
      db,
      row.productId,
      row.fromEmail,
      row.subject ?? "",
      row.inReplyTo,
      row.references
    ));
  const claimed = await db
    .update(inboundEmails)
    .set({ processingStatus: "releasing", errorMessage: null })
    .where(
      and(
        eq(inboundEmails.id, row.id),
        eq(inboundEmails.processingStatus, "quarantined")
      )
    )
    .returning({ id: inboundEmails.id });
  if (claimed.length === 0) {
    const latest = await db.query.inboundEmails.findFirst({
      where: eq(inboundEmails.id, row.id),
    });
    if (latest?.processingStatus === "processed" && latest.releasedAt) {
      return {
        success: true,
        action: latest.replyId ? "reply_added" : "ticket_created",
        ticketId: latest.ticketId ?? undefined,
        replyId: latest.replyId ?? undefined,
      };
    }
    if (latest?.processingStatus === "releasing") {
      return { success: true, action: "duplicate" };
    }
    throw new Error("Inbound email is not quarantined");
  }

  try {
    if (candidateTicketId) {
      const reply = await addEmailReply(db, context, candidateTicketId, release);
      if (reply) return reply;
    }
    if (!input.ticketTypeId) throw new Error("A ticket type is required to release a new email");
    const type = await db.query.ticketTypes.findFirst({
      where: eq(ticketTypes.id, input.ticketTypeId),
    });
    if (
      !type ||
      type.productId !== row.productId ||
      type.archivedAt ||
      (type.systemKey !== null && type.systemKey !== "unclassified")
    ) {
      throw new Error("Ticket type is not available for this product");
    }
    const current = type.systemKey === "unclassified"
      ? null
      : await loadCurrentTemplateVersion(db, type.id);
    if (!type.systemKey && !current) throw new Error("Ticket type has no active form version");
    return await createEmailTicket(
      db,
      context,
      type,
      current?.version.id ?? null,
      null,
      release
    );
  } catch (error) {
    await db
      .update(inboundEmails)
      .set({ processingStatus: "quarantined" })
      .where(
        and(
          eq(inboundEmails.id, row.id),
          eq(inboundEmails.processingStatus, "releasing")
        )
      );
    throw error;
  }
}

export function extractThreadMessageIds(
  inReplyTo?: string,
  references?: string
): string[] {
  const extract = (header?: string): string[] => {
    const trimmed = header?.trim();
    if (!trimmed) return [];
    const bracketed = trimmed.match(/<[^<>\r\n]{1,998}>/g);
    if (bracketed?.length) return bracketed;
    return trimmed.length <= 998 && !/[<>\s\r\n]/.test(trimmed)
      ? [trimmed]
      : [];
  };
  const values = [
    ...extract(inReplyTo),
    ...extract(references).slice(-49),
  ].slice(0, 50);
  const variants = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    const bare = trimmed.replace(/^</, "").replace(/>$/, "");
    if (!bare || bare.length > 998 || /[<>\s\r\n]/.test(bare)) continue;
    variants.add(bare);
    variants.add(`<${bare}>`);
  }
  return [...variants];
}
