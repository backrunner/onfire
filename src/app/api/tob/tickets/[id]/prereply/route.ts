import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { tickets } from "@/drizzle/schema";
import { ok, notFound, ApiError } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { assertTicketVisible } from "@/lib/api/scope";
import { generatePrereply } from "@/services/ai/prereply";
import { enforceRateLimit } from "@/lib/rate-limit";

const prereplySchema = z.object({
  language: z.enum(["en", "zh"]).optional(),
  tone: z.enum(["formal", "friendly", "professional"]).optional(),
});

/**
 * POST /api/tob/tickets/:id/prereply — generate an AI-suggested reply for the
 * ticket (grounded on the product knowledge base when available). The
 * suggestion is also persisted on the ticket as `aiSuggestedReply`.
 */
export const POST = withAuth(
  { permission: "ticket.write" },
  async (req: NextRequest, ctx) => {
    await enforceRateLimit(
      ctx.db,
      req,
      "tob:ai-prereply",
      { limit: 30, windowSeconds: 60 },
      ctx.user.id
    );
    const ticket = await ctx.db.query.tickets.findFirst({
      where: eq(tickets.id, ctx.params.id),
    });
    if (!ticket) throw notFound("Ticket not found");
    assertTicketVisible(ctx, ticket);

    const body = await parseBody(req, prereplySchema);

    const result = await generatePrereply(ctx.db, {
      ticketId: ticket.id,
      includeKnowledge: true,
      language: body.language,
      tone: body.tone,
    });

    if (!result) {
      throw new ApiError(503, "AI pre-reply is not configured");
    }

    return ok(result);
  }
);
