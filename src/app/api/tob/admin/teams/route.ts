import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { productTeams, teams } from "@/drizzle/schema";
import { ok, badRequest } from "@/lib/api/response";
import { withAuth, parseBody, parseQuery } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { STAFF_SCOPES, assertCanManageStaff, parseStaffScope, teamScopeFilter } from "@/lib/staff-scope";

const listQuerySchema = z.object({
  scope: z.enum(STAFF_SCOPES).optional(),
  tenantId: z.string().optional(),
  productId: z.string().optional(),
});

const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(100),
  tenantId: z.string().optional(),
  productId: z.string().optional(),
  scope: z.enum(STAFF_SCOPES).optional(),
  allowReassign: z.boolean().optional(),
  productIds: z.array(z.string().min(1)).optional(),
});

export const GET = withAuth({ permission: "team.manage" }, async (req: NextRequest, ctx) => {
  const query = parseQuery(req, listQuerySchema);
  if (ctx.isSuperAdmin && !query.scope && !query.tenantId && !query.productId) {
    return ok(await ctx.db.select().from(teams));
  }
  const ref = await assertCanManageStaff(ctx, parseStaffScope(query));
  const teamList = await ctx.db.select().from(teams).where(teamScopeFilter(ref));
  return ok(teamList);
});

export const POST = withAuth({ permission: "team.manage" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createTeamSchema);
  const ref = await assertCanManageStaff(
    ctx,
    parseStaffScope({
      scope: body.scope,
      tenantId: body.tenantId,
      productId: body.productId,
    })
  );

  const productIds =
    ref.scope === "product" && ref.productId
      ? [ref.productId]
      : [...new Set(body.productIds ?? [])];
  const selectedProducts = await Promise.all(
    productIds.map((id) => assertProductAccess(ctx, id))
  );
  if (
    ref.tenantId &&
    selectedProducts.some((product) => product.tenantId !== ref.tenantId)
  ) {
    throw badRequest("Products must belong to the team's tenant");
  }

  const id = crypto.randomUUID();
  const insertTeam = ctx.db.insert(teams).values({
    id,
    tenantId: ref.scope === "system" ? null : ref.tenantId ?? null,
    productId: ref.scope === "product" ? ref.productId ?? null : null,
    scope: ref.scope,
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
