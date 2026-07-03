import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { teams, agentTeams, productTeams } from "@/drizzle/schema";
import { ok, notFound } from "@/lib/api/response";
import { withAuth, parseBody, type AuthedContext } from "@/lib/api/handler";

const updateTeamSchema = z.object({
  name: z.string().min(1).optional(),
  allowReassign: z.boolean().optional(),
  memberIds: z.array(z.string()).optional(),
});

async function loadAccessibleTeam(ctx: AuthedContext, id: string) {
  const team = await ctx.db.query.teams.findFirst({ where: eq(teams.id, id) });
  // 404 for cross-tenant access to avoid leaking team existence.
  if (!team || (!ctx.isSuperAdmin && !ctx.tenantIds.includes(team.tenantId))) {
    throw notFound("Team not found");
  }
  return team;
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
    productIds: productRows.map((r) => r.productId),
  });
});

export const PATCH = withAuth({ permission: "team.manage" }, async (req: NextRequest, ctx) => {
  const team = await loadAccessibleTeam(ctx, ctx.params.id);
  const body = await parseBody(req, updateTeamSchema);

  const teamFields = {
    ...(body.name !== undefined && { name: body.name }),
    ...(body.allowReassign !== undefined && { allowReassign: body.allowReassign }),
  };

  const statements: BatchItem<"sqlite">[] = [];
  if (Object.keys(teamFields).length > 0) {
    statements.push(ctx.db.update(teams).set(teamFields).where(eq(teams.id, team.id)));
  }
  if (body.memberIds !== undefined) {
    statements.push(ctx.db.delete(agentTeams).where(eq(agentTeams.teamId, team.id)));
    if (body.memberIds.length > 0) {
      statements.push(
        ctx.db
          .insert(agentTeams)
          .values(body.memberIds.map((userId) => ({ userId, teamId: team.id })))
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

  await ctx.db.batch([
    ctx.db.delete(agentTeams).where(eq(agentTeams.teamId, team.id)),
    ctx.db.delete(productTeams).where(eq(productTeams.teamId, team.id)),
    ctx.db.delete(teams).where(eq(teams.id, team.id)),
  ]);

  return ok({ deleted: true });
});
