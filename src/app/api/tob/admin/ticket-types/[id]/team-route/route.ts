import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { ticketTypeRoutes } from "@/drizzle/schema";
import { parseBody, withAuth } from "@/lib/api/handler";
import { forbidden, notFound, ok, badRequest } from "@/lib/api/response";
import { Role } from "@/lib/types";
import { assertTypeRouteTeam } from "@/services/ticket-types";
import { loadAccessibleTicketType } from "../../shared";

const schema = z.object({ teamId: z.string().min(1) });

async function visibleRoute(ctx: Parameters<typeof loadAccessibleTicketType>[0], typeId: string) {
  const route = await ctx.db.query.ticketTypeRoutes.findFirst({
    where: eq(ticketTypeRoutes.ticketTypeId, typeId),
  });
  if (route && ctx.role === Role.TeamAdmin && !ctx.teamIds.includes(route.teamId)) {
    throw notFound("Ticket type route not found");
  }
  return route;
}

export const GET = withAuth({ permission: "ticket_type.route" }, async (_req, ctx) => {
  const type = await loadAccessibleTicketType(ctx, ctx.params.id);
  return ok(await visibleRoute(ctx, type.id));
});

export const PATCH = withAuth({ permission: "ticket_type.route" }, async (req: NextRequest, ctx) => {
  const type = await loadAccessibleTicketType(ctx, ctx.params.id);
  await visibleRoute(ctx, type.id);
  const body = await parseBody(req, schema);
  try {
    await assertTypeRouteTeam(ctx.db, type.productId, body.teamId);
  } catch {
    throw badRequest("Team is not attached to this product");
  }
  if (ctx.role === Role.TeamAdmin && !ctx.teamIds.includes(body.teamId)) {
    throw forbidden("TeamAdmin can only route ticket types to their own teams");
  }
  const now = new Date().toISOString();
  await ctx.db
    .insert(ticketTypeRoutes)
    .values({
      ticketTypeId: type.id,
      teamId: body.teamId,
      createdBy: ctx.user.id,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: ticketTypeRoutes.ticketTypeId,
      set: { teamId: body.teamId, createdBy: ctx.user.id, updatedAt: now },
    });
  return ok(await ctx.db.query.ticketTypeRoutes.findFirst({
    where: eq(ticketTypeRoutes.ticketTypeId, type.id),
  }));
});

export const DELETE = withAuth({ permission: "ticket_type.route" }, async (_req, ctx) => {
  const type = await loadAccessibleTicketType(ctx, ctx.params.id);
  const route = await visibleRoute(ctx, type.id);
  if (!route) return ok({ deleted: true });
  await ctx.db.delete(ticketTypeRoutes).where(eq(ticketTypeRoutes.ticketTypeId, type.id));
  return ok({ deleted: true });
});
