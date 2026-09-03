import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { emailConfigs, type EmailConfigRow } from "@/drizzle/schema";
import { ok, notFound, badRequest } from "@/lib/api/response";
import { withAuth, parseBody, parseQuery } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import type { Database } from "@/lib/db";
import { getEnv } from "@/lib/db";
import { hasConfiguredAITask } from "@/services/ai/config";
import { sealEmailConfigFields } from "@/services/email/config-secrets";

const querySchema = z.object({
  productId: z.string().min(1),
});

const upsertSchema = z.object({
  productId: z.string().min(1),
  inboundEnabled: z.boolean().optional(),
  inboundProvider: z.enum(["maileroo", "resend", "cloudflare", "generic"]).nullable().optional(),
  inboundAddress: z.string().email().nullable().optional(),
  inboundWebhookSecret: z.string().max(500).nullable().optional(),
  inboundApiKey: z.string().max(500).nullable().optional(),
  outboundEnabled: z.boolean().optional(),
  outboundProvider: z.enum(["resend", "sendgrid", "mailgun", "maileroo", "cloudflare", "smtp"]).nullable().optional(),
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
    hasInboundApiKey: Boolean(row.inboundApiKey),
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

  const [config, aiFilterAvailable] = await Promise.all([
    ctx.db.query.emailConfigs.findFirst({
      where: eq(emailConfigs.productId, productId),
    }),
    hasConfiguredAITask(ctx.db, "prescreening", { productId }),
  ]);
  return ok(
    config
      ? { ...toConfigView(config), aiFilterAvailable }
      : { aiFilterAvailable }
  );
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
  const { productId, ...rawFields } = body;
  const fields = await sealEmailConfigFields(
    productId,
    normalizeFields(rawFields),
    getEnv().AUTH_SECRET
  );

  const existing = await ctx.db.query.emailConfigs.findFirst({
    where: eq(emailConfigs.productId, productId),
  });
  await validateConfiguration(ctx.db, productId, existing, fields);

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

  const { productId: _productId, ...rawFields } = body;
  const fields = await sealEmailConfigFields(
    body.productId,
    normalizeFields(rawFields),
    getEnv().AUTH_SECRET
  );
  await validateConfiguration(ctx.db, body.productId, existing, fields);
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

function normalizeFields<T extends Record<string, unknown>>(fields: T): T {
  return {
    ...fields,
    ...(typeof fields.inboundAddress === "string" && {
      inboundAddress: fields.inboundAddress.trim().toLowerCase(),
    }),
    ...(typeof fields.outboundSenderEmail === "string" && {
      outboundSenderEmail: fields.outboundSenderEmail.trim().toLowerCase(),
    }),
    ...(typeof fields.outboundReplyTo === "string" && {
      outboundReplyTo: fields.outboundReplyTo.trim().toLowerCase(),
    }),
  } as T;
}

async function validateConfiguration(
  db: Database,
  productId: string,
  existing: EmailConfigRow | undefined,
  fields: Record<string, unknown>
): Promise<void> {
  const merged = { ...(existing ?? {}), ...definedOnly(fields) } as Partial<EmailConfigRow>;

  if (merged.inboundAddress) {
    const duplicate = await db.query.emailConfigs.findFirst({
      where: and(
        sql`lower(${emailConfigs.inboundAddress}) = ${merged.inboundAddress.toLowerCase()}`,
        sql`${emailConfigs.productId} <> ${productId}`
      ),
    });
    if (duplicate) throw badRequest("Inbound address is already assigned to another product");
  }
  if (merged.inboundEnabled) {
    if (!merged.inboundProvider || !merged.inboundAddress) {
      throw badRequest("Inbound provider and address are required when inbound email is enabled");
    }
  }
  if (
    fields.aiFilterEnabled &&
    !existing?.aiFilterEnabled &&
    !(await hasConfiguredAITask(db, "prescreening", { productId }))
  ) {
    throw badRequest("AI email filtering requires a configured prescreening credential");
  }

  if (!merged.outboundEnabled) return;
  if (!merged.outboundProvider || !merged.outboundSenderEmail) {
    throw badRequest("Outbound provider and sender email are required when outbound email is enabled");
  }
  if (merged.outboundProvider === "smtp") {
    if (
      !merged.outboundSmtpHost ||
      !merged.outboundSmtpPort ||
      !merged.outboundSmtpUser ||
      !merged.outboundSmtpPass
    ) {
      throw badRequest("SMTP host, port, user, and password are required");
    }
  } else if (
    merged.outboundProvider !== "cloudflare" &&
    !merged.outboundApiKey
  ) {
    throw badRequest("An API key is required for the selected outbound provider");
  }
}
