import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { productTeams, teams, tenants } from "@/drizzle/schema";
import { ok, badRequest, notFound } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { assertProductAccess, tenantCondition } from "@/lib/api/scope";
import { Role } from "@/lib/types";

const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(100),
  tenantId: z.string().optional(),
  allowReassign: z.boolean().optional(),
  productIds: z.array(z.string().min(1)).optional(),
});

export const GET = withAuth({ permission: "team.manage" }, async (_req: NextRequest, ctx) => {
  if (ctx.role === Role.ProductAdmin) {
    if (ctx.productIds.length === 0) return ok([]);
    const associations = await ctx.db
      .select({ teamId: productTeams.teamId })
      .from(productTeams)
      .where(inArray(productTeams.productId, ctx.productIds));
    const teamIds = [...new Set(associations.map((row) => row.teamId))];
    if (teamIds.length === 0) return ok([]);
    const teamList = await ctx.db
      .select()
      .from(teams)
      .where(inArray(teams.id, teamIds));
    return ok(teamList);
  }

  const teamList = await ctx.db
    .select()
    .from(teams)
    .where(tenantCondition(ctx, teams.tenantId));
  return ok(teamList);
});

export const POST = withAuth({ permission: "team.manage" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createTeamSchema);

  // SuperAdmin may create a team in any tenant; others only in their own.
  const tenantId = body.tenantId ?? ctx.user.tenantId;
  if (!ctx.isSuperAdmin && !ctx.tenantIds.includes(tenantId)) {
    throw badRequest("Invalid tenantId");
  }
  const tenant = await ctx.db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });
  if (!tenant) throw notFound("Tenant not found");
  const productIds = [...new Set(body.productIds ?? [])];
  if (ctx.role === Role.ProductAdmin && productIds.length === 0) {
    throw badRequest("ProductAdmin must attach a new team to a product");
  }
  const selectedProducts = await Promise.all(
    productIds.map((id) => assertProductAccess(ctx, id))
  );
  if (selectedProducts.some((product) => product.tenantId !== tenantId)) {
    throw badRequest("Products must belong to the team's tenant");
  }

  const id = crypto.randomUUID();

  const insertTeam = ctx.db.insert(teams).values({
    id,
    tenantId,
    name: body.name,
    allowReassign: body.allowReassign ?? true,
  });
  if (productIds.length > 0) {
    await ctx.db.batch([
      insertTeam,
      ctx.db
        .insert(productTeams)
        .values(productIds.map((productId) => ({ productId, teamId: id }))),
    ]);
  } else {
    await insertTeam;
  }

  const created = await ctx.db.query.teams.findFirst({ where: eq(teams.id, id) });
  return ok(created, 201);
});
