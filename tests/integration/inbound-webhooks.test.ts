import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import {
  emailConfigs,
  products,
  teams,
  tenants,
  tickets,
} from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { base64ToBytes, hmacSha256Base64 } from "@/lib/crypto";
import { sealSecret } from "@/lib/secret-storage";
import { createTestDb, uid, NOW } from "./test-db";
import { POST as mailerooPOST } from "@/app/api/toc/webhooks/maileroo/route";
import { POST as resendPOST } from "@/app/api/toc/webhooks/resend/route";

const MASTER_SECRET = "test-master-secret";

let db: Database;

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    getDb: () => db,
    getEnv: () => ({ AUTH_SECRET: MASTER_SECRET }),
  };
});

beforeAll(async () => {
  db = await createTestDb();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Seed tenant + default team + product + inbound email config. */
async function seedInbound(options: {
  provider: "maileroo" | "resend";
  webhookSecret?: string;
  apiKey?: string;
}) {
  const tenantId = uid("tenant");
  const teamId = uid("team");
  const productId = uid("prod");
  const address = `${uid("support")}@example.com`;

  await db.insert(tenants).values({
    id: tenantId,
    name: tenantId,
    defaultTeamId: teamId,
  });
  await db.insert(teams).values({ id: teamId, tenantId, name: teamId });
  await db.insert(products).values({
    id: productId,
    tenantId,
    name: productId,
    slaMediumAccept: 60,
    slaMediumReply: 240,
  });
  await db.insert(emailConfigs).values({
    id: uid("cfg"),
    productId,
    inboundEnabled: true,
    inboundProvider: options.provider,
    inboundAddress: address,
    inboundWebhookSecret: options.webhookSecret
      ? await sealSecret(
          options.webhookSecret,
          MASTER_SECRET,
          `email-config:${productId}:inboundWebhookSecret`
        )
      : null,
    inboundApiKey: options.apiKey
      ? await sealSecret(
          options.apiKey,
          MASTER_SECRET,
          `email-config:${productId}:inboundApiKey`
        )
      : null,
    aiFilterEnabled: false,
    createdAt: NOW(),
    updatedAt: NOW(),
  });

  return { tenantId, teamId, productId, address };
}

function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

interface WebhookResult {
  data: {
    action: string;
    ticketId: string;
    replyId?: string;
    ignored?: boolean;
  };
}

async function resultOf(res: Response): Promise<WebhookResult> {
  return (await res.json()) as WebhookResult;
}

type FetchMock = ReturnType<
  typeof vi.fn<(url: unknown, init?: RequestInit) => Promise<Response>>
>;

function mailerooPayload(address: string, overrides: Record<string, unknown> = {}) {
  return {
    _id: "677730adac1b7a32de362ccd",
    message_id: `<${uid("msgid")}@gmail.com>`,
    domain: "mail.maileroo.com",
    envelope_sender: "sender@gmail.com",
    recipients: [address],
    headers: {
      From: ["Maileroo <sender@gmail.com>"],
      To: [address],
      Subject: ["Re: Test"],
      "In-Reply-To": ["<thread@example.com>"],
      References: ["<thread@example.com>"],
      "Message-Id": [`<${uid("hdr")}@gmail.com>`],
    },
    body: {
      plaintext: "Full plaintext body",
      stripped_plaintext: "Stripped reply text",
      html: "<p>Full HTML</p>",
      stripped_html: "<p>Stripped HTML</p>",
      other_parts: null,
      raw_mime: { url: "https://example.com/raw", size: 3248 },
    },
    attachments: [],
    spf_result: "pass",
    dkim_result: true,
    is_dmarc_aligned: true,
    is_spam: false,
    deletion_url: "https://inbound-api.maileroo.net/email/abc",
    validation_url:
      "https://inbound-api.maileroo.net/validate-callback/677730adac1b7a32de362cce/b71bfca7653deeb8802c87124ba65212",
    processed_at: 1735864493,
    ...overrides,
  };
}

describe("maileroo inbound webhook", () => {
  const URL = "https://support.example.com/api/toc/webhooks/maileroo";

  it("creates a ticket from a validated payload", async () => {
    const { address, productId } = await seedInbound({ provider: "maileroo" });
    const fetchMock: FetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await mailerooPOST(postJson(URL, mailerooPayload(address)));
    expect(res.status).toBe(200);
    const json = await resultOf(res);
    expect(json.data.action).toBe("ticket_created");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [validationUrl, init] = fetchMock.mock.calls[0];
    expect(String(validationUrl)).toContain(
      "https://inbound-api.maileroo.net/validate-callback/"
    );
    expect(init?.method).toBe("GET");

    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, json.data.ticketId),
    });
    expect(ticket?.productId).toBe(productId);
    // The stripped reply part wins over the full body.
    expect(ticket?.content).toBe("Stripped reply text");
    expect(ticket?.customerEmail).toBe("sender@gmail.com");
  });

  it("rejects a validation URL on a foreign host without fetching it", async () => {
    const { address } = await seedInbound({ provider: "maileroo" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await mailerooPOST(
      postJson(
        URL,
        mailerooPayload(address, {
          validation_url: "https://evil.example.com/validate",
        })
      )
    );
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a payload without a validation URL", async () => {
    const { address } = await seedInbound({ provider: "maileroo" });
    const payload: Record<string, unknown> = mailerooPayload(address);
    delete payload.validation_url;

    const res = await mailerooPOST(postJson(URL, payload));
    expect(res.status).toBe(401);
  });

  it("rejects when the validation callback does not confirm", async () => {
    const { address } = await seedInbound({ provider: "maileroo" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ success: false }), { status: 200 })
      )
    );

    const res = await mailerooPOST(postJson(URL, mailerooPayload(address)));
    expect(res.status).toBe(401);
  });

  it("rejects payloads with no usable body", async () => {
    const { address } = await seedInbound({ provider: "maileroo" });
    const res = await mailerooPOST(
      postJson(
        URL,
        mailerooPayload(address, {
          body: { plaintext: "", stripped_plaintext: "", html: null, stripped_html: null },
        })
      )
    );
    expect(res.status).toBe(400);
  });

  it("falls back to the To header when recipients do not match", async () => {
    const { address, productId } = await seedInbound({ provider: "maileroo" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ success: true }), { status: 200 })
      )
    );

    const res = await mailerooPOST(
      postJson(
        URL,
        mailerooPayload(address, {
          recipients: ["unrelated@example.com"],
          headers: {
            From: ["sender@gmail.com"],
            To: [`Support <${address}>`],
            Subject: ["Help"],
          },
        })
      )
    );
    expect(res.status).toBe(200);
    const json = await resultOf(res);
    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, json.data.ticketId),
    });
    expect(ticket?.productId).toBe(productId);
    // Bare From header supplies the sender identity.
    expect(ticket?.customerEmail).toBe("sender@gmail.com");
  });

  it("returns 404 for unknown inbound addresses", async () => {
    await seedInbound({ provider: "maileroo" });
    const res = await mailerooPOST(
      postJson(URL, mailerooPayload(`${uid("nobody")}@example.com`))
    );
    expect(res.status).toBe(404);
  });
});

describe("resend inbound webhook", () => {
  const URL = "https://support.example.com/api/toc/webhooks/resend";
  const RECEIVING_URL_PREFIX = "https://api.resend.com/emails/receiving/";

  async function svixHeaders(secret: string, id: string, timestamp: string, body: string) {
    const signature = await hmacSha256Base64(
      `${id}.${timestamp}.${body}`,
      base64ToBytes(secret.slice("whsec_".length))
    );
    return {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    };
  }

  function resendEvent(address: string, overrides: Record<string, unknown> = {}) {
    return {
      type: "email.received",
      created_at: NOW(),
      data: {
        email_id: uid("email"),
        created_at: NOW(),
        from: "Acme <sender@gmail.com>",
        to: [address],
        bcc: [],
        cc: [],
        message_id: `<${uid("msgid")}@resend.dev>`,
        subject: "Need help",
        attachments: [],
        ...overrides,
      },
    };
  }

  function stubReceivingApi(body: Record<string, unknown> = {}): FetchMock {
    return vi.fn(async () =>
      new Response(
        JSON.stringify({
          object: "email",
          id: "email-id",
          to: [],
          from: "Acme <sender@gmail.com>",
          subject: "Need help",
          html: "<p>Body from the receiving API</p>",
          text: null,
          headers: { "in-reply-to": "<thread@example.com>" },
          message_id: `<${uid("received")}@resend.dev>`,
          bcc: [],
          cc: [],
          reply_to: [],
          raw: { download_url: "https://example.com/raw", expires_at: NOW() },
          attachments: [],
          ...body,
        }),
        { status: 200 }
      )
    );
  }

  function newSigningSecret(): string {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `whsec_${btoa(binary)}`;
  }

  it("creates a ticket from a signed email.received event", async () => {
    const secret = newSigningSecret();
    const { address, productId } = await seedInbound({
      provider: "resend",
      webhookSecret: secret,
      apiKey: "re_test_key",
    });
    const fetchMock = stubReceivingApi();
    vi.stubGlobal("fetch", fetchMock);

    const body = JSON.stringify(resendEvent(address));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const headers = await svixHeaders(secret, uid("svix"), timestamp, body);

    const res = await resendPOST(postJson(URL, body, headers));
    expect(res.status).toBe(200);
    const json = await resultOf(res);
    expect(json.data.action).toBe("ticket_created");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [receivingUrl, init] = fetchMock.mock.calls[0];
    expect(String(receivingUrl)).toContain(RECEIVING_URL_PREFIX);
    expect(init?.headers).toMatchObject({
      authorization: "Bearer re_test_key",
    });

    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, json.data.ticketId),
    });
    expect(ticket?.productId).toBe(productId);
    expect(ticket?.content).toBe("Body from the receiving API");
    expect(ticket?.customerEmail).toBe("sender@gmail.com");
  });

  it("rejects an invalid signature", async () => {
    const secret = newSigningSecret();
    const { address } = await seedInbound({
      provider: "resend",
      webhookSecret: secret,
      apiKey: "re_test_key",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const body = JSON.stringify(resendEvent(address));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const headers = await svixHeaders(
      newSigningSecret(),
      uid("svix"),
      timestamp,
      body
    );

    const res = await resendPOST(postJson(URL, body, headers));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a stale timestamp", async () => {
    const secret = newSigningSecret();
    const { address } = await seedInbound({
      provider: "resend",
      webhookSecret: secret,
      apiKey: "re_test_key",
    });

    const body = JSON.stringify(resendEvent(address));
    const stale = String(Math.floor(Date.now() / 1000) - 600);
    const headers = await svixHeaders(secret, uid("svix"), stale, body);

    const res = await resendPOST(postJson(URL, body, headers));
    expect(res.status).toBe(401);
  });

  it("rejects a tampered body", async () => {
    const secret = newSigningSecret();
    const { address } = await seedInbound({
      provider: "resend",
      webhookSecret: secret,
      apiKey: "re_test_key",
    });

    const body = JSON.stringify(resendEvent(address));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const headers = await svixHeaders(secret, uid("svix"), timestamp, body);
    const tampered = body.replace("Need help", "Forged subject");

    const res = await resendPOST(postJson(URL, tampered, headers));
    expect(res.status).toBe(401);
  });

  it("acknowledges and ignores other event types", async () => {
    const res = await resendPOST(
      postJson(URL, {
        type: "email.delivered",
        created_at: NOW(),
        data: { email_id: uid("email") },
      })
    );
    expect(res.status).toBe(200);
    const json = await resultOf(res);
    expect(json.data.ignored).toBe(true);
  });

  it("returns 404 when no product matches the recipients", async () => {
    const secret = newSigningSecret();
    await seedInbound({
      provider: "resend",
      webhookSecret: secret,
      apiKey: "re_test_key",
    });

    const body = JSON.stringify(resendEvent(`${uid("nobody")}@example.com`));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const headers = await svixHeaders(secret, uid("svix"), timestamp, body);

    const res = await resendPOST(postJson(URL, body, headers));
    expect(res.status).toBe(404);
  });
});
