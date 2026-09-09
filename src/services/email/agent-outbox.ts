import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { emailConfigs, emailDispatches, emailReplyIntents, outboundEmails, replies, notificationLogs } from "@/drizzle/schema";
import { getEnv, type Database } from "@/lib/db";
import { emailAddressAllowed } from "@/lib/email-queue";
import type { DeliveryReceipt, OutboundClaim } from "@/lib/email-agent-contract";
import { badRequest } from "@/lib/api/response";

export function agentProduct(address: string): string | undefined {
  const routes: Record<string, string> = getEnv().EMAIL_AGENT_PRODUCTS ?? {};
  return routes[address.trim().toLowerCase()];
}

export function assertAgentProduct(address: string | null | undefined, productId: string): void {
  if (!address) return;
  const owner = agentProduct(address);
  if (owner && owner !== productId) throw badRequest("Mail agent address belongs to another product");
  if (emailAddressAllowed(address, getEnv().EMAIL_AGENT_ADDRESSES) && !owner) throw badRequest("Mail agent address has no product route");
}

export function usesMailAgent(provider: string | null, sender: string | null): boolean {
  return provider === "cloudflare" && !!sender &&
    emailAddressAllowed(sender, getEnv().EMAIL_AGENT_ADDRESSES);
}

export async function prepareReplyEmailIntent(db: Database, ticketId: string, productId: string, replyId: string) {
  const config = await db.query.emailConfigs.findFirst({ where: eq(emailConfigs.productId, productId) });
  if (!config?.outboundEnabled || !usesMailAgent(config.outboundProvider, config.outboundSenderEmail)) return undefined;
  assertAgentProduct(config.outboundSenderEmail, productId);
  return { statement: db.insert(emailReplyIntents).values({ replyId, ticketId, createdAt: new Date().toISOString() }).onConflictDoNothing() };
}

export async function enqueueOutbound(db: Database, id: string): Promise<void> {
  await getEnv().EMAIL_OUTBOUND_QUEUE.send({ version: 1, kind: "outbound", id });
  await db.update(emailDispatches).set({ queuedAt: new Date().toISOString() }).where(eq(emailDispatches.id, id));
}

export async function claimOutbound(db: Database, id: string): Promise<OutboundClaim> {
  const dispatch = await db.query.emailDispatches.findFirst({ where: eq(emailDispatches.id, id) });
  const email = await db.query.outboundEmails.findFirst({ where: eq(outboundEmails.id, id) });
  if (!dispatch || !email || !usesMailAgent(email.provider, email.fromEmail)) return { state: "done" };
  assertAgentProduct(email.fromEmail, email.productId);
  if (["sending", "uncertain"].includes(email.status) && dispatch.attemptToken) return { state: "sending", token: dispatch.attemptToken };
  if (email.status !== "queued") return { state: "done" };
  if (email.ticketId) {
    const earlier = await db.query.outboundEmails.findFirst({ where: and(
      eq(outboundEmails.ticketId, email.ticketId), inArray(outboundEmails.status, ["queued", "sending", "uncertain"]),
      or(lt(outboundEmails.createdAt, email.createdAt), and(eq(outboundEmails.createdAt, email.createdAt), lt(outboundEmails.id, id))),
    ) });
    if (earlier) return { state: "blocked" };
  }
  const config = await db.query.emailConfigs.findFirst({ where: eq(emailConfigs.productId, email.productId) });
  if (!config?.outboundEnabled || config.outboundProvider !== "cloudflare" ||
      config.outboundSenderEmail?.toLowerCase() !== email.fromEmail.toLowerCase()) {
    const errorMessage = "Outbound configuration changed before delivery";
    await db.batch([
      db.update(outboundEmails).set({ status: "failed", errorMessage })
        .where(and(eq(outboundEmails.id, id), eq(outboundEmails.status, "queued"))),
      ...(email.notificationLogId ? [db.update(notificationLogs).set({ status: "failed", errorMessage })
        .where(and(eq(notificationLogs.id, email.notificationLogId),
          sql`EXISTS (SELECT 1 FROM outbound_emails WHERE id = ${id} AND status = 'failed')`))] : []),
    ]);
    return { state: "done" };
  }
  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  // One atomic batch elects the sender. A competing delivery cannot claim the same row.
  const [claimed] = await db.batch([
    db.update(emailDispatches).set({ attemptToken: token, attemptStartedAt: now, attempts: sql`${emailDispatches.attempts} + 1` })
      .where(and(eq(emailDispatches.id, id), isNull(emailDispatches.attemptToken),
        sql`EXISTS (SELECT 1 FROM outbound_emails WHERE id = ${id} AND status = 'queued')`))
      .returning({ id: emailDispatches.id }),
    db.update(outboundEmails).set({ status: "sending", errorMessage: null })
      .where(and(eq(outboundEmails.id, id), sql`EXISTS (SELECT 1 FROM email_dispatches WHERE id = ${id} AND attempt_token = ${token})`)),
  ]);
  if (!claimed.length) return claimOutbound(db, id);
  let headers = dispatch.headers ?? undefined;
  if (email.ticketId) {
    const previous = await db.query.outboundEmails.findFirst({
      where: and(eq(outboundEmails.ticketId, email.ticketId), eq(outboundEmails.status, "sent")),
      orderBy: desc(outboundEmails.sentAt),
    });
    const { buildThreadHeaders } = await import("./outbound");
    headers = { ...headers, ...buildThreadHeaders(previous?.providerMessageId) };
  }
  return {
    state: "ready", token,
    message: {
      to: email.toEmail, from: email.fromEmail, fromName: email.fromName || undefined,
      replyTo: dispatch.replyTo || undefined, subject: email.subject,
      html: email.bodyHtml, text: email.bodyPlain || undefined, headers,
    },
  };
}

export async function completeOutbound(db: Database, receipt: DeliveryReceipt): Promise<void> {
  const dispatch = await db.query.emailDispatches.findFirst({ where: eq(emailDispatches.id, receipt.id) });
  const email = await db.query.outboundEmails.findFirst({ where: eq(outboundEmails.id, receipt.id) });
  if (!dispatch || !email || !usesMailAgent(email.provider, email.fromEmail)) throw new Error("Unknown agent delivery");
  assertAgentProduct(email.fromEmail, email.productId);
  if (dispatch.attemptToken !== receipt.token) throw new Error("Stale delivery receipt");
  if (["sent", "failed"].includes(email.status)) return;
  if (!["sending", "uncertain"].includes(email.status)) throw new Error("Delivery is not in progress");
  if (receipt.status === "sent" && (!receipt.messageId || /[\r\n]/.test(receipt.messageId))) {
    throw new Error("Missing or invalid provider Message-ID");
  }
  const retry = receipt.status === "retry" && dispatch.attempts < 8;
  const status = retry ? "queued" : receipt.status === "retry" ? "failed" : receipt.status;
  const now = new Date().toISOString();
  const appliedReceipt = sql`EXISTS (SELECT 1 FROM outbound_emails e JOIN email_dispatches d ON d.id = e.id WHERE e.id = ${receipt.id} AND e.status = ${status} AND d.attempt_token = ${receipt.token})`;
  await db.batch([
    db.update(outboundEmails).set({
      status, providerMessageId: receipt.status === "sent" ? receipt.messageId : null,
      sentAt: receipt.status === "sent" ? now : null,
      errorMessage: receipt.error || null,
    }).where(and(eq(outboundEmails.id, receipt.id), inArray(outboundEmails.status, ["sending", "uncertain"]),
      sql`EXISTS (SELECT 1 FROM email_dispatches WHERE id = ${receipt.id} AND attempt_token = ${receipt.token})`)),
    ...(receipt.status === "sent" && email.replyId ? [db.update(replies).set({ emailSent: true })
      .where(and(eq(replies.id, email.replyId), appliedReceipt))] : []),
    ...(email.notificationLogId ? [db.update(notificationLogs).set({
      status: status === "sent" ? "sent" : status === "queued" ? "pending" : "failed",
      sentAt: status === "sent" ? now : null, errorMessage: receipt.error || null,
    }).where(and(eq(notificationLogs.id, email.notificationLogId), appliedReceipt))] : []),
    ...(retry ? [db.update(emailDispatches).set({ attemptToken: null, attemptStartedAt: null })
      .where(and(eq(emailDispatches.id, receipt.id), eq(emailDispatches.attemptToken, receipt.token), appliedReceipt))] : []),
  ]);
}

/** Scheduled repair also handles a crash between a committed outbox insert and queue.send(). */
export async function repairEmailOutbox(db: Database): Promise<void> {
  const { sendTicketNotification } = await import("./outbound");
  const intents = await db.select().from(emailReplyIntents).limit(25);
  for (const intent of intents) {
    try {
      const result = await sendTicketNotification(db, { ticketId: intent.ticketId, replyId: intent.replyId, templateType: "ticket_replied" });
      if (result.success || result.error === "Outbound email not enabled for product" || result.error === "Customer has no email address") {
        await db.delete(emailReplyIntents).where(eq(emailReplyIntents.replyId, intent.replyId));
      }
    } catch (error) {
      console.error("Email reply intent repair failed:", intent.replyId, error);
    }
  }
  const stale = new Date(Date.now() - 20 * 60_000).toISOString();
  const errorMessage = "Delivery acknowledgement missing; inspect provider logs before resending";
  await db.batch([
    db.update(outboundEmails).set({ status: "uncertain", errorMessage })
      .where(and(eq(outboundEmails.status, "sending"), sql`id IN (SELECT id FROM email_dispatches WHERE attempt_started_at < ${stale})`)),
    db.update(notificationLogs).set({ status: "failed", errorMessage })
      .where(and(eq(notificationLogs.status, "pending"), sql`id IN (SELECT notification_log_id FROM outbound_emails WHERE status = 'uncertain')`)),
  ]);
  const jobs = await db.select({ id: emailDispatches.id }).from(emailDispatches)
    .innerJoin(outboundEmails, eq(outboundEmails.id, emailDispatches.id))
    .where(and(eq(outboundEmails.status, "queued"), or(isNull(emailDispatches.queuedAt), lt(emailDispatches.queuedAt, new Date(Date.now() - 5 * 60_000).toISOString()))))
    .limit(50);
  for (const job of jobs) {
    try { await enqueueOutbound(db, job.id); }
    catch (error) { console.error("Email dispatch repair failed:", job.id, error); }
  }
}
