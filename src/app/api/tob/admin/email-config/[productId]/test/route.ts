import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, err } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { sendConfiguredEmail } from "@/services/email/outbound";

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

  const result = await sendConfiguredEmail(ctx.db, productId, {
    to: body.to,
    subject: "OnFire test email",
    html: "<p>This is a test email from your OnFire outbound email configuration. If you received it, the configuration works.</p>",
  });

  if (!result.success) {
    return err(result.error ?? "Test send failed", 502);
  }
  return ok({ sent: !result.queued, queued: result.queued ?? false, emailId: result.emailId, messageId: result.messageId });
});
