import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { processInboundEmail } from "@/services/email/inbound";

interface MailerooWebhookPayload {
  from: string;
  from_name?: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  message_id?: string;
  spam_score?: number;
  spf?: string;
  dkim?: string;
}

export async function POST(request: NextRequest) {
  const db = getDb();

  let payload: MailerooWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  // Validate required fields
  if (!payload.from || !payload.to || !payload.subject) {
    return NextResponse.json(
      { ok: false, error: "Missing required fields" },
      { status: 400 }
    );
  }

  // Convert Maileroo format to our standard format
  const result = await processInboundEmail(db, {
    fromEmail: payload.from,
    fromName: payload.from_name,
    toEmail: payload.to,
    subject: payload.subject,
    bodyPlain: payload.text,
    bodyHtml: payload.html,
    messageId: payload.message_id,
    spfResult: payload.spf,
    dkimResult: payload.dkim === "pass",
    isSpam: payload.spam_score !== undefined && payload.spam_score > 5,
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
