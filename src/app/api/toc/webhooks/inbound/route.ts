import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { emailConfigs } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { processInboundEmail, type InboundEmailPayload } from "@/services/email/inbound";

export async function POST(request: NextRequest) {
  const db = getDb();

  // Get authorization
  const authHeader = request.headers.get("Authorization");
  const signatureHeader = request.headers.get("X-Webhook-Signature");

  let body: InboundEmailPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Validate required fields
  if (!body.fromEmail || !body.toEmail || !body.subject) {
    return NextResponse.json(
      { ok: false, error: "Missing required fields: fromEmail, toEmail, subject" },
      { status: 400 }
    );
  }

  if (!body.bodyPlain && !body.bodyHtml) {
    return NextResponse.json(
      { ok: false, error: "At least one of bodyPlain or bodyHtml is required" },
      { status: 400 }
    );
  }

  // Find config by inbound address to verify webhook secret
  const config = await db.query.emailConfigs.findFirst({
    where: eq(emailConfigs.inboundAddress, body.toEmail),
  });

  if (!config) {
    return NextResponse.json(
      { ok: false, error: "Unknown inbound address" },
      { status: 404 }
    );
  }

  // Verify authentication
  const webhookSecret = config.inboundWebhookSecret;
  if (webhookSecret) {
    let authenticated = false;

    // Method 1: Bearer token
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (token === webhookSecret) {
        authenticated = true;
      }
    }

    // Method 2: HMAC signature
    if (!authenticated && signatureHeader?.startsWith("sha256=")) {
      const signature = signatureHeader.slice(7);
      const bodyText = JSON.stringify(body);
      const expectedSignature = await computeHmac(bodyText, webhookSecret);
      if (signature === expectedSignature) {
        authenticated = true;
      }
    }

    if (!authenticated) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
  }

  // Process the email
  const result = await processInboundEmail(db, {
    fromEmail: body.fromEmail,
    fromName: body.fromName,
    toEmail: body.toEmail,
    subject: body.subject,
    bodyPlain: body.bodyPlain,
    bodyHtml: body.bodyHtml,
    messageId: body.messageId,
    spfResult: body.spfResult,
    dkimResult: body.dkimResult,
    isSpam: body.isSpam,
  });

  if (!result.success) {
    return NextResponse.json(
      { ok: false, error: result.reason, action: result.action },
      { status: result.action === "error" ? 500 : 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: {
      action: result.action,
      ticketId: result.ticketId,
      replyId: result.replyId,
    },
  });
}

async function computeHmac(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
