import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { tickets } from "@/drizzle/schema";
import { ok, notFound, badRequest } from "@/lib/api/response";
import { withAuth } from "@/lib/api/handler";
import { assertTicketVisible } from "@/lib/api/scope";
import { getEnv } from "@/lib/db";
import { storeImageAttachment } from "@/lib/attachments";

/**
 * POST /api/tob/tickets/:id/attachments — upload an inline reply image.
 * Returns the public serving URL to embed in rich-text content.
 */
export const POST = withAuth(
  { permission: "ticket.write" },
  async (req: NextRequest, ctx) => {
    const ticket = await ctx.db.query.tickets.findFirst({
      where: eq(tickets.id, ctx.params.id),
    });
    if (!ticket) throw notFound("Ticket not found");
    assertTicketVisible(ctx, ticket);

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw badRequest("Missing image file");

    const stored = await storeImageAttachment(ctx.db, getEnv().R2, {
      ticketId: ticket.id,
      file,
    });
    return ok(stored, 201);
  }
);
