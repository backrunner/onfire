import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { emailConfigs, emailDispatches, emailReplyIntents, notificationLogs, outboundEmails, products, replies, teams, tenants, tickets } from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { TicketPriority, TicketStatus } from "@/lib/types";
import { enqueueInboundEmail, repairInboundEnqueue } from "@/lib/email-queue";
import type { InboundQueueMessage, OutboundQueueMessage } from "@/lib/email-queue";
import { claimOutbound, completeOutbound, prepareReplyEmailIntent, repairEmailOutbox } from "@/services/email/agent-outbox";
import { sendConfiguredEmail } from "@/services/email/outbound";
import { consumeAgentOutbound } from "@/services/email/agent-consumer";
import { processQueuedInbound } from "@/services/email/queued-inbound";
import { createTestDb, NOW, uid } from "./test-db";

const mocks = vi.hoisted(() => ({ env: {} as Record<string, unknown>, db: undefined as Database | undefined }));
vi.mock("@/lib/db", () => ({ getEnv: () => mocks.env, getDb: () => mocks.db }));
vi.mock("@/services/ticket-events", () => ({ emitTicketEvent: vi.fn() }));

const address = "support@example.com";
let db: Database;
let productId: string;
let ticketId: string;
let storage: R2Bucket;
let queueSend: ReturnType<typeof vi.fn>;

function memoryR2() {
  const objects = new Map<string, { bytes: ArrayBuffer; metadata?: Record<string, string> }>();
  return {
    delete: vi.fn(async (key: string) => { objects.delete(key); }),
    head: vi.fn(async (key: string) => objects.has(key) ? { key } : null),
    list: vi.fn(async () => ({ objects: [...objects.keys()].filter(key => key.startsWith("pending/")).map(key => ({ key, uploaded: new Date(Date.now() - 120000) })) })),
    put: vi.fn(async (key: string, value: ArrayBuffer | string, opts?: R2PutOptions) => {
      objects.set(key, { bytes: typeof value === "string" ? new TextEncoder().encode(value).buffer : value, metadata: opts?.customMetadata });
    }),
    get: vi.fn(async (key: string) => {
      const stored = objects.get(key);
      if (!stored) return null;
      return { size: stored.bytes.byteLength, customMetadata: stored.metadata,
        arrayBuffer: async () => stored.bytes,
        json: async () => JSON.parse(new TextDecoder().decode(stored.bytes)),
      };
    }),
  } as unknown as R2Bucket;
}

function queueBatch(id: string, attempts = 1) {
  const message = { id: crypto.randomUUID(), attempts, body: { version: 1, kind: "outbound", id } satisfies OutboundQueueMessage,
    ack: vi.fn(), retry: vi.fn() };
  return { message, batch: { messages: [message], queue: "onfire-email-outbound" } as unknown as MessageBatch<unknown> };
}

beforeEach(async () => {
  db = await createTestDb(); mocks.db = db;
  productId = uid("product"); ticketId = uid("ticket");
  const tenantId = uid("tenant"), teamId = uid("team");
  await db.insert(tenants).values({ id: tenantId, name: "Tenant", defaultTeamId: teamId });
  await db.insert(teams).values({ id: teamId, tenantId, name: "Support" });
  await db.insert(products).values({ id: productId, tenantId, name: "WiFiBuddy" });
  await db.insert(tickets).values({ id: ticketId, productId, tenantId, teamId, status: TicketStatus.New, priority: TicketPriority.Medium, createdAt: NOW(), updatedAt: NOW(), customerEmail: "customer@example.com", subject: "Help", content: "Help" });
  await db.insert(emailConfigs).values({ id: uid("config"), productId, inboundEnabled: true, inboundProvider: "cloudflare", inboundAddress: address,
    outboundEnabled: true, outboundProvider: "cloudflare", outboundSenderEmail: address, aiFilterEnabled: false, createdAt: NOW(), updatedAt: NOW() });
  storage = memoryR2(); queueSend = vi.fn().mockResolvedValue(undefined);
  mocks.env = { EMAIL_AGENT_ADDRESSES: address, EMAIL_AGENT_PRODUCTS: { [address]: productId }, EMAIL_STORAGE: storage, EMAIL_OUTBOUND_QUEUE: { send: queueSend }, AUTH_SECRET: "test-secret" };
});

async function queueEmail(replyId?: string) {
  return sendConfiguredEmail(db, productId, { to: "customer@example.com", subject: "Update", html: "<p>Updated</p>", headers: { "In-Reply-To": "<customer@example.com>" } }, { ticketId, replyId });
}

describe("durable mail agent outbox", () => {
  it("commits one outbox per reply and repairs an unavailable queue", async () => {
    queueSend.mockRejectedValue(new Error("queue unavailable"));
    const first = await queueEmail("reply-1"), second = await queueEmail("reply-1");
    expect(first).toMatchObject({ success: true, queued: true, emailId: second.emailId });
    expect(await db.select().from(outboundEmails)).toHaveLength(1);
    expect(await db.select().from(emailDispatches)).toHaveLength(1);
    queueSend.mockResolvedValue(undefined);
    await repairEmailOutbox(db);
    expect(queueSend).toHaveBeenLastCalledWith({ version: 1, kind: "outbound", id: first.emailId });
    expect((await db.query.outboundEmails.findFirst())?.status).toBe("queued");
  });

  it("does not execute an intent before the reply transaction", async () => {
    const intent = await prepareReplyEmailIntent(db, ticketId, productId, "intent-reply");
    expect(await db.select().from(emailReplyIntents)).toHaveLength(0);
    await db.batch([
      db.insert(replies).values({ id: "intent-reply", ticketId, senderId: "agent", content: "Reply", internal: false, createdAt: NOW() }),
      intent!.statement,
    ]);
    expect(await db.select().from(emailReplyIntents)).toHaveLength(1);
    await repairEmailOutbox(db);
    expect(await db.select().from(emailReplyIntents)).toHaveLength(0);
    expect((await db.query.outboundEmails.findFirst())?.status).toBe("queued");
  });

  it("elects exactly one sender across concurrent deliveries and validates receipt tokens", async () => {
    const result = await queueEmail();
    const claims = await Promise.all([claimOutbound(db, result.emailId!), claimOutbound(db, result.emailId!)]);
    expect(claims.filter(c => c.state === "ready")).toHaveLength(1);
    const claim = claims.find(c => c.state === "ready")!;
    expect(claim.message.headers).not.toHaveProperty("Message-ID");
    await expect(completeOutbound(db, { id: result.emailId!, token: crypto.randomUUID(), status: "sent", messageId: "<actual@cloudflare.net>" })).rejects.toThrow("Stale");
    await completeOutbound(db, { id: result.emailId!, token: claim.token, status: "sent", messageId: "<actual@cloudflare.net>" });
    expect(await claimOutbound(db, result.emailId!)).toEqual({ state: "done" });
    expect((await db.query.outboundEmails.findFirst())?.providerMessageId).toBe("<actual@cloudflare.net>");
  });

  it("replays a persisted send receipt without sending the email twice", async () => {
    const result = await queueEmail();
    const sender = { send: vi.fn().mockResolvedValue({ messageId: "<actual@cloudflare.net>" }) };
    const complete = vi.fn().mockRejectedValueOnce(new Error("main unavailable")).mockImplementation(receipt => completeOutbound(db, receipt));
    const env = { main: { claim: (id: string) => claimOutbound(db, id), complete }, storage, sender: sender as unknown as SendEmail, allowedAddresses: address };
    const first = queueBatch(result.emailId!); await consumeAgentOutbound(first.batch, env);
    expect(first.message.retry).toHaveBeenCalled();
    const again = queueBatch(result.emailId!, 2); await consumeAgentOutbound(again.batch, env);
    expect(again.message.ack).toHaveBeenCalled();
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect((await db.query.outboundEmails.findFirst())?.status).toBe("sent");
  });

  it("retries definitive throttling but records unknown delivery outcomes for review", async () => {
    const result = await queueEmail();
    const sender = { send: vi.fn().mockRejectedValueOnce(Object.assign(new Error("slow down"), { code: "E_RATE_LIMIT_EXCEEDED" })).mockRejectedValueOnce(new Error("network lost")) };
    const env = { main: { claim: (id: string) => claimOutbound(db, id), complete: (receipt: Parameters<typeof completeOutbound>[1]) => completeOutbound(db, receipt) }, storage, sender: sender as unknown as SendEmail, allowedAddresses: address };
    const first = queueBatch(result.emailId!); await consumeAgentOutbound(first.batch, env);
    expect((await db.query.outboundEmails.findFirst())?.status).toBe("queued");
    const second = queueBatch(result.emailId!, 2); await consumeAgentOutbound(second.batch, env);
    expect((await db.query.outboundEmails.findFirst())?.status).toBe("uncertain");
    await consumeAgentOutbound(queueBatch(result.emailId!, 3).batch, env);
    expect(sender.send).toHaveBeenCalledTimes(2);
  });

  it("blocks later messages in a thread and refreshes headers after the first send", async () => {
    const first = await queueEmail();
    await db.update(outboundEmails).set({ createdAt: "2020-01-01T00:00:00.000Z" }).where(eq(outboundEmails.id, first.emailId!));
    const second = await queueEmail();
    expect(await claimOutbound(db, second.emailId!)).toEqual({ state: "blocked" });
    const claim = await claimOutbound(db, first.emailId!);
    if (claim.state !== "ready") throw new Error("Not claimed");
    await completeOutbound(db, { id: first.emailId!, token: claim.token, status: "sent", messageId: "<first@cloudflare.net>" });
    const next = await claimOutbound(db, second.emailId!);
    expect(next).toMatchObject({ state: "ready", message: { headers: { "In-Reply-To": "<first@cloudflare.net>" } } });
  });

  it("rechecks current product configuration before delivery", async () => {
    const result = await queueEmail();
    await db.update(emailConfigs).set({ outboundEnabled: false }).where(eq(emailConfigs.productId, productId));
    expect(await claimOutbound(db, result.emailId!)).toEqual({ state: "done" });
    expect((await db.query.outboundEmails.findFirst())?.status).toBe("failed");
  });

  it("reports a missing acknowledgement and recovers the linked notification from a late receipt", async () => {
    await db.insert(notificationLogs).values({ id: "notice", productId, ticketId, recipientUserId: "agent", channelType: "email", triggerEvent: "ticket_created", createdAt: NOW() });
    const result = await sendConfiguredEmail(db, productId, { to: "agent@example.com", subject: "Ticket", html: "<p>Ticket</p>" }, { notificationLogId: "notice" });
    const claim = await claimOutbound(db, result.emailId!);
    if (claim.state !== "ready") throw new Error("Not claimed");
    await db.update(emailDispatches).set({ attemptStartedAt: "2020-01-01T00:00:00.000Z" }).where(eq(emailDispatches.id, result.emailId!));
    await repairEmailOutbox(db);
    expect((await db.query.outboundEmails.findFirst())?.status).toBe("uncertain");
    expect((await db.query.notificationLogs.findFirst())?.status).toBe("failed");
    await completeOutbound(db, { id: result.emailId!, token: claim.token, status: "sent", messageId: "<late@cloudflare.net>" });
    expect((await db.query.notificationLogs.findFirst())?.status).toBe("sent");
  });

  it("keeps notifications pending during a safe retry and rejects a receipt from the previous attempt", async () => {
    await db.insert(notificationLogs).values({ id: "notice", productId, ticketId, recipientUserId: "agent", channelType: "email", triggerEvent: "ticket_created", createdAt: NOW() });
    const result = await sendConfiguredEmail(db, productId, { to: "agent@example.com", subject: "Ticket", html: "<p>Ticket</p>" }, { notificationLogId: "notice" });
    const first = await claimOutbound(db, result.emailId!);
    if (first.state !== "ready") throw new Error("Not claimed");
    await completeOutbound(db, { id: result.emailId!, token: first.token, status: "retry", error: "Throttled" });
    expect((await db.query.notificationLogs.findFirst())?.status).toBe("pending");
    const second = await claimOutbound(db, result.emailId!);
    if (second.state !== "ready") throw new Error("Not claimed");
    await expect(completeOutbound(db, { id: result.emailId!, token: first.token, status: "sent", messageId: "<stale@cloudflare.net>" })).rejects.toThrow("Stale");
    expect((await db.query.notificationLogs.findFirst())?.status).toBe("pending");
    await completeOutbound(db, { id: result.emailId!, token: second.token, status: "sent", messageId: "<actual@cloudflare.net>" });
    expect((await db.query.notificationLogs.findFirst())?.status).toBe("sent");
  });

  it("prevents another product from using the reserved agent sender", async () => {
    mocks.env.EMAIL_AGENT_PRODUCTS = { [address]: "another-product" };
    await expect(queueEmail()).rejects.toThrow("another product");
    expect(await db.select().from(outboundEmails)).toHaveLength(0);
  });

  it("does not mark a reply as emailed until the agent confirms sending", async () => {
    await db.insert(replies).values({ id: "confirmed-reply", ticketId, senderId: "agent", content: "Reply", internal: false, createdAt: NOW() });
    const result = await queueEmail("confirmed-reply");
    expect((await db.query.replies.findFirst())?.emailSent).toBe(false);
    const claim = await claimOutbound(db, result.emailId!);
    if (claim.state !== "ready") throw new Error("Not claimed");
    await completeOutbound(db, { id: result.emailId!, token: claim.token, status: "sent", messageId: "<actual@cloudflare.net>" });
    expect((await db.query.replies.findFirst())?.emailSent).toBe(true);
  });

  it("rejects unauthenticated access to the internal task API", async () => {
    const { POST } = await import("@/app/api/toc/tasks/email-agent/route");
    const response = await POST(new NextRequest("https://internal/api/toc/tasks/email-agent", { method: "POST", body: JSON.stringify({ action: "claim", id: "anything" }) }), { params: Promise.resolve({}) });
    expect(response.status).toBe(401);
  }, 15_000);
});

describe("queued inbound transport", () => {
  function message(raw: string, to = address) {
    return { from: "customer@example.com", to, raw: new Response(raw).body!, rawSize: new TextEncoder().encode(raw).length,
      headers: new Headers({ "authentication-results": "mx.cloudflare.net; spf=pass; dkim=pass" }), setReject: vi.fn() } as unknown as ForwardableEmailMessage;
  }
  const raw = "From: attacker@example.com\r\nTo: wrong@example.com\r\nSubject: Need help\r\nContent-Type: text/plain\r\n\r\nMy WiFi connection fails.";

  it("stores raw MIME, queues only a reference, trusts the SMTP envelope, and deduplicates missing Message-ID", async () => {
    const published: InboundQueueMessage[] = [];
    const queue = { send: vi.fn(async (job: InboundQueueMessage) => { published.push(job); }) } as unknown as Queue<InboundQueueMessage>;
    await enqueueInboundEmail(message(raw), storage, queue, "agent", address);
    await enqueueInboundEmail(message(raw), storage, queue, "agent", address);
    expect(published[0]).toEqual(published[1]);
    expect(JSON.stringify(published[0]).length).toBeLessThan(200);
    expect(await processQueuedInbound(db, published[0])).toMatchObject({ action: "ticket_created" });
    expect(await processQueuedInbound(db, published[1])).toMatchObject({ action: "duplicate" });
    const created = await db.select().from(tickets).where(eq(tickets.customerEmail, "customer@example.com"));
    expect(created).toHaveLength(2); // fixture ticket and one inbound ticket
  });

  it("rejects another recipient before storage or queue access", async () => {
    const mail = message(raw, "support@other.example.com");
    await enqueueInboundEmail(mail, storage, { send: queueSend } as unknown as Queue<InboundQueueMessage>, "agent", address);
    expect(mail.setReject).toHaveBeenCalled();
    expect(storage.put).not.toHaveBeenCalled();
    expect(queueSend).not.toHaveBeenCalled();
  });

  it("propagates queue failures after durable storage", async () => {
    queueSend.mockRejectedValue(new Error("queue offline"));
    await expect(enqueueInboundEmail(message(raw), storage, { send: queueSend } as unknown as Queue<InboundQueueMessage>, "agent", address)).rejects.toThrow("queue offline");
    expect(storage.put).toHaveBeenCalled();
    queueSend.mockResolvedValue(undefined);
    await repairInboundEnqueue(storage, { send: queueSend } as unknown as Queue<InboundQueueMessage>);
    expect(queueSend).toHaveBeenCalledTimes(2);
    expect(storage.delete).toHaveBeenCalled();
  });

  it("rejects oversized mail without reading or storing its body", async () => {
    const mail = message(raw);
    Object.defineProperty(mail, "rawSize", { value: 10 * 1024 * 1024 + 1 });
    await enqueueInboundEmail(mail, storage, { send: queueSend } as unknown as Queue<InboundQueueMessage>, "agent", address);
    expect(mail.setReject).toHaveBeenCalled();
    expect(storage.put).not.toHaveBeenCalled();
  });
});
