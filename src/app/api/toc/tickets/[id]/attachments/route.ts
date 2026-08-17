import { NextRequest } from "next/server";
import { TicketStatus } from "@/lib/types";
import { ok, badRequest } from "@/lib/api/response";
import { withCustomerAuth } from "@/lib/api/handler";
import { loadCustomerTicket } from "@/lib/tickets/customer-access";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getEnv } from "@/lib/db";
import { storeImageAttachment } from "@/lib/attachments";

/**
 * POST /api/toc/tickets/:id/attachments — customer inline reply image upload.
 * Authenticated by the customer JWT, rate-limited, and restricted to images
 * verified by magic bytes.
 */
export const POST = withCustomerAuth(async (req: NextRequest, ctx) => {
  await enforceRateLimit(
    ctx.db,
    req,
    "toc:attachment",
    { limit: 20, windowSeconds: 60 },
    ctx.customer.sub
  );

  const ticket = await loadCustomerTicket(ctx, ctx.params.id);
  if (ticket.status === TicketStatus.Closed) {
    throw badRequest("This ticket is closed and no longer accepts replies");
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Missing image file");

  const stored = await storeImageAttachment(ctx.db, getEnv().R2, {
    ticketId: ticket.id,
    file,
  });
  return ok(stored, 201);
});
