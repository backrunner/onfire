import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import {
  categoryRoutes,
  notificationRequirements,
  ticketTypeRoutes,
  ticketTypes,
  notificationRules,
  teams,
  agentTeams,
  productTeams,
  tenants,
  tickets,
  users,
  agents,
} from "@/drizzle/schema";
import { conflict, ok, badRequest, forbidden } from "@/lib/api/response";
import { withAuth, parseBody, type AuthedContext } from "@/lib/api/handler";
import { assertProductAccess, assertTeamAccess } from "@/lib/api/scope";
import { Role } from "@/lib/types";

const updateTeamSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  allowReassign: z.boolean().optional(),
  memberIds: z.array(z.string()).optional(),
  productIds: z.array(z.string()).optional(),
});

async function loadAccessibleTeam(ctx: AuthedContext, id: string) {
  return assertTeamAccess(ctx, id);
}

export const GET = withAuth({ permission: "team.manage" }, async (_req: NextRequest, ctx) => {
  const team = await loadAccessibleTeam(ctx, ctx.params.id);

  const memberRows = await ctx.db
    .select({ userId: agentTeams.userId })
    .from(agentTeams)
    .where(eq(agentTeams.teamId, team.id));

  const productRows = await ctx.db
    .select({ productId: productTeams.productId })
    .from(productTeams)
    .where(eq(productTeams.teamId, team.id));

  return ok({
    ...team,
    memberIds: memberRows.map((r) => r.userId),
    productIds: productRows
      .map((r) => r.productId)
      .filter(
        (productId) =>
          ctx.role !== Role.ProductAdmin || ctx.productIds.includes(productId)
      ),
  });
});

export const PATCH = withAuth({ permission: "team.manage" }, async (req: NextRequest, ctx) => {
  const team = await loadAccessibleTeam(ctx, ctx.params.id);
  const body = await parseBody(req, updateTeamSchema);

  const productIds = body.productIds
    ? [...new Set(body.productIds)]
    : undefined;
  const memberIds = body.memberIds
    ? [...new Set(body.memberIds)]
    : undefined;
  let nextProductIds: string[] | undefined;

  // Team identity, membership, and reassignment policy are global to a team.
  // A ProductAdmin must not change those fields on a team shared with a
  // product outside their `user_products` scope.
  if (
    ctx.role === Role.ProductAdmin &&
    ((body.name !== undefined && body.name.trim() !== team.name) ||
      (body.allowReassign !== undefined &&
        body.allowReassign !== (team.allowReassign ?? true)) ||
      memberIds !== undefined)
  ) {
    const existingAssociations = await ctx.db
      .select({ productId: productTeams.productId })
      .from(productTeams)
      .where(eq(productTeams.teamId, team.id));
    if (
      existingAssociations.some(
        (row) => !ctx.productIds.includes(row.productId)
      )
    ) {
      throw forbidden("Cannot modify a team shared with another product");
    }
  }

  if (productIds) {
    if (ctx.role === Role.ProductAdmin && productIds.length === 0) {
      throw badRequest("ProductAdmin must keep the team attached to a product");
    }
    const selectedProducts = await Promise.all(
      productIds.map((id) => assertProductAccess(ctx, id))
    );
    if (selectedProducts.some((product) => product.tenantId !== team.tenantId)) {
      throw badRequest("Products must belong to the team's tenant");
    }

    const existing = await ctx.db
      .select({ productId: productTeams.productId })
      .from(productTeams)
      .where(eq(productTeams.teamId, team.id));
    const retained =
      ctx.role === Role.ProductAdmin
        ? existing
            .map((row) => row.productId)
            .filter((id) => !ctx.productIds.includes(id))
        : [];
    nextProductIds = [...new Set([...retained, ...productIds])];
    const removedProductIds = existing
      .map((row) => row.productId)
      .filter((id) => !nextProductIds?.includes(id));
    if (removedProductIds.length > 0) {
      const removedTypes = await ctx.db
        .select({ id: ticketTypes.id })
        .from(ticketTypes)
        .where(inArray(ticketTypes.productId, removedProductIds));
      const [typeRoute, notificationRule, notificationRequirement] =
        await Promise.all([
          removedTypes.length
            ? ctx.db.query.ticketTypeRoutes.findFirst({
                where: and(
                  eq(ticketTypeRoutes.teamId, team.id),
                  inArray(
                    ticketTypeRoutes.ticketTypeId,
                    removedTypes.map((type) => type.id)
                  )
                ),
              })
            : undefined,
          ctx.db.query.notificationRules.findFirst({
            where: and(
              eq(notificationRules.recipientTeamId, team.id),
              inArray(notificationRules.productId, removedProductIds)
            ),
          }),
          ctx.db.query.notificationRequirements.findFirst({
            where: and(
              eq(notificationRequirements.scopeTeamId, team.id),
              inArray(notificationRequirements.productId, removedProductIds)
            ),
          }),
        ]);
      if (typeRoute) {
        throw conflict(
          "Remove or reassign ticket type routes before detaching their products"
        );
      }
      if (notificationRule || notificationRequirement) {
        throw conflict(
          "Remove or reassign notification policies before detaching their products"
        );
      }
    }
  }
  if (memberIds && memberIds.length > 0) {
    const [userRows, agentRows] = await Promise.all([
      ctx.db.select().from(users).where(inArray(users.id, memberIds)),
      ctx.db.select().from(agents).where(inArray(agents.userId, memberIds)),
    ]);
    if (
      userRows.length !== memberIds.length ||
      userRows.some((user) => user.tenantId !== team.tenantId) ||
      agentRows.length !== memberIds.length
    ) {
      throw badRequest("Every team member must be an agent in the same tenant");
    }
  }

  const teamFields = {
    ...(body.name !== undefined && { name: body.name }),
    ...(body.allowReassign !== undefined && { allowReassign: body.allowReassign }),
  };

  const statements: BatchItem<"sqlite">[] = [];
  if (Object.keys(teamFields).length > 0) {
    statements.push(ctx.db.update(teams).set(teamFields).where(eq(teams.id, team.id)));
  }
  if (memberIds !== undefined) {
    statements.push(ctx.db.delete(agentTeams).where(eq(agentTeams.teamId, team.id)));
    if (memberIds.length > 0) {
      statements.push(
        ctx.db
          .insert(agentTeams)
          .values(memberIds.map((userId) => ({ userId, teamId: team.id })))
      );
    }
  }
  if (productIds !== undefined) {
    statements.push(
      ctx.db.delete(productTeams).where(eq(productTeams.teamId, team.id))
    );
    if (nextProductIds && nextProductIds.length > 0) {
      statements.push(
        ctx.db.insert(productTeams).values(
          nextProductIds.map((productId) => ({ productId, teamId: team.id }))
        )
      );
    }
  }
  if (statements.length > 0) {
    await ctx.db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  }

  const updated = await ctx.db.query.teams.findFirst({ where: eq(teams.id, team.id) });
  return ok(updated);
});

export const DELETE = withAuth({ permission: "team.manage" }, async (_req: NextRequest, ctx) => {
  const team = await loadAccessibleTeam(ctx, ctx.params.id);

  const dependencies = await Promise.all([
    ctx.db.query.tickets.findFirst({ where: eq(tickets.teamId, team.id) }),
    ctx.db.query.tenants.findFirst({ where: eq(tenants.defaultTeamId, team.id) }),
    ctx.db.query.categoryRoutes.findFirst({ where: eq(categoryRoutes.teamId, team.id) }),
    ctx.db.query.ticketTypeRoutes.findFirst({ where: eq(ticketTypeRoutes.teamId, team.id) }),
    ctx.db.query.notificationRules.findFirst({
      where: eq(notificationRules.recipientTeamId, team.id),
    }),
    ctx.db.query.notificationRequirements.findFirst({
      where: eq(notificationRequirements.scopeTeamId, team.id),
    }),
  ]);
  if (dependencies.some(Boolean)) {
    throw conflict("Team is still referenced by tickets, routing, notifications, or a tenant default");
  }

  if (ctx.role === Role.ProductAdmin) {
    const associations = await ctx.db
      .select({ productId: productTeams.productId })
      .from(productTeams)
      .where(eq(productTeams.teamId, team.id));
    if (associations.some((row) => !ctx.productIds.includes(row.productId))) {
      throw forbidden("Cannot delete a team shared with another product");
    }
  }

  await ctx.db.batch([
    ctx.db.delete(agentTeams).where(eq(agentTeams.teamId, team.id)),
    ctx.db.delete(productTeams).where(eq(productTeams.teamId, team.id)),
    ctx.db.delete(teams).where(eq(teams.id, team.id)),
  ]);

  return ok({ deleted: true });
});
