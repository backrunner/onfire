import { requestedTocLanguage } from "@/lib/product-language";
import { NextRequest } from "next/server";
import { TicketStatus } from "@/lib/types";
import { ok, badRequest } from "@/lib/api/response";
import { localizedErr, requestLanguage } from "@/lib/api/error-messages";
import { withCustomerAuth, parseBody } from "@/lib/api/handler";
import { loadCustomerTicket } from "@/lib/tickets/customer-access";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { enforceRateLimit } from "@/lib/rate-limit";
import { addCustomerReply, replySchema } from "@/services/customer-reply";

/**
 * POST /api/toc/tickets/:id/reply — customer reply.
 * Replying to a ticket in "replied" status moves it back to "processing".
 */
export const POST = withCustomerAuth(async (req: NextRequest, ctx) => {
  await enforceRateLimit(
    ctx.db,
    req,
    "toc:reply",
    { limit: 10, windowSeconds: 60 },
    ctx.customer.sub
  );

  const ticket = await loadCustomerTicket(ctx, ctx.params.id);

  if (ticket.status === TicketStatus.Closed) {
    throw badRequest("This ticket is closed and no longer accepts replies");
  }

  const body = await parseBody(req, replySchema);

  const captcha = await verifyTurnstileToken(
    body.turnstileToken,
    req.headers.get("cf-connecting-ip")
  );
  if (!captcha.success) {
    return localizedErr(req, "CAPTCHA verification failed", 400, captcha.errorCodes);
  }

  return ok(await addCustomerReply(ctx.db, ctx.customer, ticket, body, { requested: requestedTocLanguage(req), accept: req.headers.get("accept-language"), errorLanguage: requestLanguage(req) }));
});
