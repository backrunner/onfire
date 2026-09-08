import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { emailConfigs, inboundEmails, products, replies, teams, tenants, tickets } from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { sealSecret } from "@/lib/secret-storage";
import { POST } from "@/app/api/toc/webhooks/stalwart/[productId]/mta-hook/route";
import { POST as eventsPOST } from "@/app/api/toc/webhooks/stalwart/[productId]/events/route";
import { hmacSha256Base64 } from "@/lib/crypto";
import { createTestDb, uid, NOW } from "./test-db";
import { normalizeStalwartHook, processStalwartEmail, stalwartHookSchema } from "@/services/email/stalwart";

let db: Database;
const secret = "stalwart-product-secret";
const master = "test-master-secret";
vi.mock("@/lib/db", async (original) => ({
  ...await original<typeof import("@/lib/db")>(),
  getDb: () => db,
  getEnv: () => ({ AUTH_SECRET: master }),
}));
vi.mock("@/services/ticket-events", () => ({ emitTicketEvent: vi.fn() }));
beforeAll(async () => { db = await createTestDb(); });
afterEach(() => { vi.restoreAllMocks(); });

async function seed() {
  const productId = uid("product");
  const tenantId = uid("tenant");
  const teamId = uid("team");
  const address = `${uid("support")}@example.com`;
  await db.insert(tenants).values({ id: tenantId, name: tenantId, defaultTeamId: teamId });
  await db.insert(teams).values({ id: teamId, tenantId, name: teamId });
  await db.insert(products).values({ id: productId, tenantId, name: productId });
  await db.insert(emailConfigs).values({
    id: uid("config"), productId, inboundAddress: address,
    inboundProvider: "stalwart", inboundEnabled: true, aiFilterEnabled: false,
    inboundWebhookSecret: await sealSecret(secret, master, `email-config:${productId}:inboundWebhookSecret`),
    createdAt: NOW(), updatedAt: NOW(),
  });
  return { productId, address, tenantId };
}

function hook(address: string) {
  return {
    context: { stage: "data", protocol: { version: 1 }, queue: { id: "100" } },
    envelope: { from: { address: "customer@example.com" }, to: [{ address }] },
    message: {
      headers: [
        ["From", "Spoofed display <different@example.com>\r\n"],
        ["Subject", "=?UTF-8?B?5rWL6K+V?=\r\n"],
        ["Message-ID", `<${uid("message")}@example.com>\r\n`],
        ["Content-Type", 'multipart/alternative; boundary="test"\r\n'],
      ],
      serverHeaders: [] as string[][],
      contents: '--test\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n \r\n--test\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<p>Hello =E4=B8=96=E7=95=8C</p>\r\n--test--\r\n',
      size: 600,
    },
  };
}

async function post(productId: string, body: unknown, token = secret) {
  return POST(new NextRequest(`https://support.example.com/api/toc/webhooks/stalwart/${productId}/mta-hook`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ productId }) });
}
async function logs(productId: string) {
  return db.select().from(inboundEmails).where(eq(inboundEmails.productId, productId));
}

describe("Stalwart MTA Hooks", () => {
  it("does not follow an inbound address reassigned after authentication", async () => {
    const a = await seed();
    const b = await seed();
    const payload = await normalizeStalwartHook(stalwartHookSchema.parse(hook(a.address)), a.address);
    await db.update(emailConfigs).set({ inboundAddress: "moved@example.com" }).where(eq(emailConfigs.productId, a.productId));
    await db.update(emailConfigs).set({ inboundAddress: a.address }).where(eq(emailConfigs.productId, b.productId));
    await expect(processStalwartEmail(db, a.productId, payload!)).rejects.toThrow(/retry delivery/);
    expect(await logs(a.productId)).toHaveLength(0);
    expect(await logs(b.productId)).toHaveLength(0);
  });
  it("parses native MIME headers/body and returns the native top-level action", async () => {
    const { productId, address } = await seed();
    const res = await post(productId, hook(address));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ action: "accept" });
    const [log] = await logs(productId);
    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, log.ticketId!) });
    expect(ticket).toMatchObject({ customerEmail: "customer@example.com", subject: "测试", content: "Hello 世界" });
  });

  it("requires the scoped bearer secret before processing", async () => {
    const { productId, address } = await seed();
    expect((await post(productId, hook(address), "wrong")).status).toBe(401);
    expect(await logs(productId)).toHaveLength(0);
  });

  it("ignores other recipients, non-DATA stages and null senders", async () => {
    const { productId, address } = await seed();
    for (const body of [hook("other@example.com"), { context: { stage: "CONNECT" } }, {
      ...hook(address), envelope: { from: { address: "" }, to: [{ address }] },
    }]) expect(await (await post(productId, body)).json()).toEqual({ action: "accept" });
    expect(await logs(productId)).toHaveLength(0);
  });

  it("processes only the configured recipient in a multi-product envelope", async () => {
    const a = await seed(); const b = await seed();
    const body = hook(a.address);
    body.envelope.to.push({ address: b.address });
    expect((await post(a.productId, body)).status).toBe(200);
    expect(await logs(a.productId)).toHaveLength(1);
    expect(await logs(b.productId)).toHaveLength(0);
  });

  it("deduplicates delivery without a Message-ID despite changed queue IDs", async () => {
    const { productId, address } = await seed();
    const body = hook(address);
    body.message.headers = body.message.headers.filter(([key]) => key !== "Message-ID");
    expect((await post(productId, body)).status).toBe(200);
    body.context.queue.id = "101";
    expect((await post(productId, body)).status).toBe(200);
    expect(await logs(productId)).toHaveLength(1);
  });

  it("associates a threaded reply and sanitizes the stored HTML", async () => {
    const { productId, address } = await seed();
    const initial = hook(address);
    await post(productId, initial);
    const body = hook(address);
    body.message.headers.push(["In-Reply-To", initial.message.headers[2][1]]);
    body.message.contents = '<p>Reply <strong>text</strong><script>alert(1)</script></p>';
    body.message.headers = body.message.headers.filter(([key]) => key !== "Content-Type");
    body.message.headers.push(["Content-Type", "text/html"]);
    expect((await post(productId, body)).status).toBe(200);
    const rows = await logs(productId);
    expect(rows[1].ticketId).toBe(rows[0].ticketId);
    const reply = await db.query.replies.findFirst({ where: eq(replies.id, rows[1].replyId!) });
    expect(reply?.contentHtml).toContain("<strong>text</strong>");
    expect(reply?.contentHtml).not.toContain("<script");
  });

  it("ignores sender-supplied authentication headers but uses server verdicts", async () => {
    const { productId, address } = await seed();
    await db.update(emailConfigs).set({ aiFilterStrictness: "high" }).where(eq(emailConfigs.productId, productId));
    const body = hook(address);
    body.message.headers.push(["Authentication-Results", "evil; spf=fail; dkim=fail"]);
    await post(productId, body);
    expect((await logs(productId))[0].processingStatus).toBe("processed");
    const spam = hook(address);
    spam.message.serverHeaders.push(["Authentication-Results", "stalwart; spf=fail"]);
    expect((await post(productId, spam)).status).toBe(200);
    expect((await logs(productId))[1].processingStatus).toBe("quarantined");
  });

  it("rejects missing DATA content, header injection, disabled config and excessive size", async () => {
    const { productId, address } = await seed();
    expect((await post(productId, { context: { stage: "data" } })).status).toBe(400);
    const injection = hook(address);
    injection.message.headers.push(["Subject", "safe\r\nContent-Type: text/html"]);
    expect((await post(productId, injection)).status).toBe(400);
    const large = hook(address); large.message.size = 11 * 1024 * 1024;
    expect((await post(productId, large)).status).toBe(400);
    await db.update(emailConfigs).set({ inboundEnabled: false }).where(eq(emailConfigs.productId, productId));
    expect((await post(productId, hook(address))).status).toBe(409);
    expect(await logs(productId)).toHaveLength(0);
  });

  it("returns a retryable failure for a pending duplicate", async () => {
    const { productId, address } = await seed();
    const body = hook(address);
    await post(productId, body);
    await db.update(inboundEmails).set({ processingStatus: "pending" }).where(eq(inboundEmails.productId, productId));
    expect((await post(productId, body)).status).toBe(503);
  });

  it("retries a failed pipeline and creates one ticket", async () => {
    const { productId, address, tenantId } = await seed();
    await db.update(tenants).set({ defaultTeamId: null }).where(eq(tenants.id, tenantId));
    const body = hook(address);
    expect((await post(productId, body)).status).toBe(503);
    const team = await db.query.teams.findFirst({ where: eq(teams.tenantId, tenantId) });
    await db.update(tenants).set({ defaultTeamId: team!.id }).where(eq(tenants.id, tenantId));
    expect((await post(productId, body)).status).toBe(200);
    expect(await logs(productId)).toHaveLength(1);
    expect((await logs(productId))[0].processingStatus).toBe("processed");
  });
});

describe("Stalwart telemetry webhooks", () => {
  const eventBody = JSON.stringify({ events: [
    { id: "100", createdAt: "2026-09-08T00:00:00Z", type: "message-ingest.ham", data: { accountId: 1, documentId: 2, messageId: "message@example.com" } },
    { id: "101", createdAt: "2026-09-08T00:00:00Z", type: "auth.success", data: { login: "private@example.com" } },
  ] });
  async function send(productId: string, body: string, headers: Record<string, string>) {
    return eventsPOST(new NextRequest(`https://support.example.com/api/toc/webhooks/stalwart/${productId}/events`, {
      method: "POST", headers, body,
    }), { params: Promise.resolve({ productId }) });
  }

  it("accepts native X-Signature without Content-Type and does not create incomplete tickets", async () => {
    const { productId } = await seed();
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const signature = await hmacSha256Base64(eventBody, new TextEncoder().encode(secret));
    const response = await send(productId, eventBody, { "X-Signature": signature });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: 1, ignored: 1 });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await logs(productId)).toHaveLength(0);
    expect(log.mock.calls.flat().join(" ")).not.toContain("private@example.com");
  });

  it("rejects modified bytes, missing secrets and foreign product credentials", async () => {
    const { productId } = await seed();
    const signature = await hmacSha256Base64(eventBody, new TextEncoder().encode(secret));
    expect((await send(productId, `${eventBody} `, { "X-Signature": signature })).status).toBe(401);
    expect((await send(productId, eventBody, {})).status).toBe(401);
    const other = await seed();
    await db.update(emailConfigs).set({ inboundWebhookSecret: await sealSecret("different", master, `email-config:${other.productId}:inboundWebhookSecret`) }).where(eq(emailConfigs.productId, other.productId));
    expect((await send(other.productId, eventBody, { "X-Signature": signature })).status).toBe(401);
  });

  it("supports Bearer and validates bounded native batches", async () => {
    const { productId } = await seed();
    vi.spyOn(console, "info").mockImplementation(() => {});
    const headers = { authorization: `Bearer ${secret}` };
    expect((await send(productId, eventBody, headers)).status).toBe(200);
    expect((await send(productId, "{", headers)).status).toBe(400);
    expect((await send(productId, JSON.stringify({ events: Array(501).fill(JSON.parse(eventBody).events[0]) }), headers)).status).toBe(400);
    expect((await send(productId, eventBody, { ...headers, "content-length": "3000000" })).status).toBe(413);
    await db.update(emailConfigs).set({ inboundEnabled: false }).where(eq(emailConfigs.productId, productId));
    expect((await send(productId, eventBody, headers)).status).toBe(409);
  });
});
