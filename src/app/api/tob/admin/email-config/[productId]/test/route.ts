import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { emailConfigs } from "@/drizzle/schema";
import { ok, err, notFound, badRequest } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { createProvider, type ProviderConfig } from "@/services/email/providers";

const testSchema = z.object({
  to: z.string().email(),
});

/**
 * POST /api/tob/admin/email-config/:productId/test — send a test email
 * through the configured outbound provider.
 */
export const POST = withAuth({ permission: "email.config" }, async (req: NextRequest, ctx) => {
  const productId = ctx.params.productId;
  await assertProductAccess(ctx, productId);

  const body = await parseBody(req, testSchema);

  const config = await ctx.db.query.emailConfigs.findFirst({
    where: eq(emailConfigs.productId, productId),
  });
  if (!config) throw notFound("Email config not found for this product");
  if (!config.outboundEnabled || !config.outboundProvider) {
    throw badRequest("Outbound email is not enabled for this product");
  }

  const provider = await createProvider({
    type: config.outboundProvider as ProviderConfig["type"],
    apiKey: config.outboundApiKey || undefined,
    smtpHost: config.outboundSmtpHost || undefined,
    smtpPort: config.outboundSmtpPort || undefined,
    smtpUser: config.outboundSmtpUser || undefined,
    smtpPassword: config.outboundSmtpPass || undefined,
  });

  const result = await provider.send({
    to: body.to,
    from: config.outboundSenderEmail || "noreply@onfire.app",
    fromName: config.outboundSenderName || "OnFire Support",
    replyTo: config.outboundReplyTo || undefined,
    subject: "OnFire test email",
    html: "<p>This is a test email from your OnFire outbound email configuration. If you received it, the configuration works.</p>",
  });

  if (!result.success) {
    return err(result.error ?? "Test send failed", 502);
  }
  return ok({ sent: true, messageId: result.messageId });
});
