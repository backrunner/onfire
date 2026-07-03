import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { emailConfigs, type EmailConfigRow } from "@/drizzle/schema";
import { ok, notFound } from "@/lib/api/response";
import { withAuth, parseBody, parseQuery } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";

const querySchema = z.object({
  productId: z.string().min(1),
});

const upsertSchema = z.object({
  productId: z.string().min(1),
  inboundEnabled: z.boolean().optional(),
  inboundProvider: z.enum(["maileroo", "sendgrid", "mailgun", "generic"]).nullable().optional(),
  inboundAddress: z.string().email().nullable().optional(),
  outboundEnabled: z.boolean().optional(),
  outboundProvider: z.enum(["resend", "sendgrid", "mailgun", "maileroo", "smtp"]).nullable().optional(),
  outboundApiKey: z.string().max(500).nullable().optional(),
  outboundSmtpHost: z.string().max(255).nullable().optional(),
  outboundSmtpPort: z.number().int().min(1).max(65535).nullable().optional(),
  outboundSmtpUser: z.string().max(255).nullable().optional(),
  outboundSmtpPass: z.string().max(255).nullable().optional(),
  outboundSenderName: z.string().max(100).nullable().optional(),
  outboundSenderEmail: z.string().email().nullable().optional(),
  outboundReplyTo: z.string().email().nullable().optional(),
  aiFilterEnabled: z.boolean().optional(),
  aiFilterStrictness: z.enum(["low", "medium", "high"]).optional(),
});

/**
 * Secrets never leave the server: API keys / SMTP passwords / webhook
 * secrets are reported as boolean presence flags only.
 */
function toConfigView(row: EmailConfigRow) {
  return {
    id: row.id,
    productId: row.productId,
    inboundEnabled: row.inboundEnabled,
    inboundProvider: row.inboundProvider,
    inboundAddress: row.inboundAddress,
    hasWebhookSecret: Boolean(row.inboundWebhookSecret),
    outboundEnabled: row.outboundEnabled,
    outboundProvider: row.outboundProvider,
    hasOutboundApiKey: Boolean(row.outboundApiKey),
    outboundSmtpHost: row.outboundSmtpHost,
    outboundSmtpPort: row.outboundSmtpPort,
    outboundSmtpUser: row.outboundSmtpUser,
    hasOutboundSmtpPass: Boolean(row.outboundSmtpPass),
    outboundSenderName: row.outboundSenderName,
    outboundSenderEmail: row.outboundSenderEmail,
    outboundReplyTo: row.outboundReplyTo,
    aiFilterEnabled: row.aiFilterEnabled,
    aiFilterStrictness: row.aiFilterStrictness,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const GET = withAuth({ permission: "email.config" }, async (req: NextRequest, ctx) => {
  const { productId } = parseQuery(req, querySchema);
  await assertProductAccess(ctx, productId);

  const config = await ctx.db.query.emailConfigs.findFirst({
    where: eq(emailConfigs.productId, productId),
  });
  return ok(config ? toConfigView(config) : null);
});

/**
 * POST /api/tob/admin/email-config — create or update (upsert by product).
 * Secret fields are only written when explicitly provided, so the UI can
 * submit the form without re-entering stored credentials.
 */
export const POST = withAuth({ permission: "email.config" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, upsertSchema);
  await assertProductAccess(ctx, body.productId);

  const now = new Date().toISOString();
  const { productId, ...fields } = body;

  const existing = await ctx.db.query.emailConfigs.findFirst({
    where: eq(emailConfigs.productId, productId),
  });

  if (existing) {
    await ctx.db
      .update(emailConfigs)
      .set({ ...definedOnly(fields), updatedAt: now })
      .where(eq(emailConfigs.id, existing.id));
    const updated = await ctx.db.query.emailConfigs.findFirst({
      where: eq(emailConfigs.id, existing.id),
    });
    return ok(updated ? toConfigView(updated) : null);
  }

  const id = crypto.randomUUID();
  await ctx.db.insert(emailConfigs).values({
    id,
    productId,
    ...definedOnly(fields),
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.query.emailConfigs.findFirst({
    where: eq(emailConfigs.id, id),
  });
  return ok(created ? toConfigView(created) : null, 201);
});

export const PATCH = withAuth({ permission: "email.config" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, upsertSchema);
  await assertProductAccess(ctx, body.productId);

  const existing = await ctx.db.query.emailConfigs.findFirst({
    where: eq(emailConfigs.productId, body.productId),
  });
  if (!existing) throw notFound("Email config not found for this product");

  const { productId: _productId, ...fields } = body;
  await ctx.db
    .update(emailConfigs)
    .set({ ...definedOnly(fields), updatedAt: new Date().toISOString() })
    .where(eq(emailConfigs.id, existing.id));

  const updated = await ctx.db.query.emailConfigs.findFirst({
    where: eq(emailConfigs.id, existing.id),
  });
  return ok(updated ? toConfigView(updated) : null);
});

function definedOnly<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}
