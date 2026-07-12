import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, ApiError } from "@/lib/api/response";
import { withAuth, parseBody, parseQuery } from "@/lib/api/handler";
import { chatWithAgent, getChatHistory } from "@/services/ai/agent";
import { eq } from "drizzle-orm";
import { tickets } from "@/drizzle/schema";
import { assertTicketVisible } from "@/lib/api/scope";
import { notFound } from "@/lib/api/response";
import { enforceRateLimit } from "@/lib/rate-limit";

const chatSchema = z.object({
  sessionId: z.string().min(1).max(128),
  message: z.string().min(1).max(8_000),
  ticketId: z.string().max(128).optional(),
});

const historyQuerySchema = z.object({
  sessionId: z.string().min(1).max(128),
});

/**
 * GET /api/tob/ai/assistant?sessionId= — chat history for the current user.
 */
export const GET = withAuth(
  { permission: "ticket.read" },
  async (req: NextRequest, ctx) => {
    const { sessionId } = parseQuery(req, historyQuerySchema);
    const messages = await getChatHistory(ctx.db, ctx.user.id, sessionId);
    return ok(messages);
  }
);

/**
 * POST /api/tob/ai/assistant — send a message to the support-agent AI
 * assistant (grounded on the ticket and product knowledge base).
 */
export const POST = withAuth(
  { permission: "ticket.read" },
  async (req: NextRequest, ctx) => {
    await enforceRateLimit(
      ctx.db,
      req,
      "tob:ai-assistant",
      { limit: 30, windowSeconds: 60 },
      ctx.user.id
    );
    const body = await parseBody(req, chatSchema);

    if (body.ticketId) {
      const ticket = await ctx.db.query.tickets.findFirst({
        where: eq(tickets.id, body.ticketId),
      });
      if (!ticket) throw notFound("Ticket not found");
      assertTicketVisible(ctx, ticket);
    }

    const result = await chatWithAgent(ctx.db, {
      userId: ctx.user.id,
      sessionId: body.sessionId,
      message: body.message,
      ticketId: body.ticketId,
    });

    if (!result) {
      throw new ApiError(503, "AI assistant is not configured");
    }

    return ok(result);
  }
);
