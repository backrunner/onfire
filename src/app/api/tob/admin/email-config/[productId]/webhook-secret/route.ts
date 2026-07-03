import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { emailConfigs } from "@/drizzle/schema";
import { ok, notFound } from "@/lib/api/response";
import { withAuth } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { randomHex } from "@/lib/crypto";

/**
 * POST /api/tob/admin/email-config/:productId/webhook-secret — rotate the
 * inbound webhook secret. The plaintext is returned exactly once.
 */
export const POST = withAuth({ permission: "email.config" }, async (_req: NextRequest, ctx) => {
  const productId = ctx.params.productId;
  await assertProductAccess(ctx, productId);

  const config = await ctx.db.query.emailConfigs.findFirst({
    where: eq(emailConfigs.productId, productId),
  });
  if (!config) throw notFound("Email config not found for this product");

  const secret = randomHex(32);
  await ctx.db
    .update(emailConfigs)
    .set({ inboundWebhookSecret: secret, updatedAt: new Date().toISOString() })
    .where(eq(emailConfigs.id, config.id));

  return ok({ webhookSecret: secret });
});
