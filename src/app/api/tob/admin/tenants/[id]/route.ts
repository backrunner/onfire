import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { customers, products, teams, tenants, tickets, users } from "@/drizzle/schema";
import { badRequest, conflict, forbidden, ok, notFound } from "@/lib/api/response";
import { withAuth, parseBody, type AuthedContext } from "@/lib/api/handler";
import { Role } from "@/lib/types";

const updateTenantSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  defaultTeamId: z.string().nullable().optional(),
});

async function loadTenant(ctx: AuthedContext, id: string) {
  const tenant = await ctx.db.query.tenants.findFirst({ where: eq(tenants.id, id) });
  if (!tenant) throw notFound("Tenant not found");
  return tenant;
}

export const GET = withAuth({}, async (_req: NextRequest, ctx) => {
  if (
    !ctx.isSuperAdmin &&
    !(ctx.role === Role.TenantAdmin && ctx.user.tenantId === ctx.params.id)
  ) {
    throw forbidden("Tenant is outside your scope");
  }
  const tenant = await loadTenant(ctx, ctx.params.id);
  return ok(tenant);
});

export const PATCH = withAuth({ permission: "tenant.manage" }, async (req: NextRequest, ctx) => {
  const tenant = await loadTenant(ctx, ctx.params.id);
  const body = await parseBody(req, updateTenantSchema);

  if (body.defaultTeamId) {
    const team = await ctx.db.query.teams.findFirst({
      where: eq(teams.id, body.defaultTeamId),
    });
    if (!team || team.tenantId !== tenant.id || team.scope !== "tenant") {
      throw badRequest("Default team must be a tenant-scope team of this tenant");
    }
  }

  await ctx.db
    .update(tenants)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.defaultTeamId !== undefined && { defaultTeamId: body.defaultTeamId }),
    })
    .where(eq(tenants.id, tenant.id));

  const updated = await ctx.db.query.tenants.findFirst({ where: eq(tenants.id, tenant.id) });
  return ok(updated);
});

export const DELETE = withAuth({ permission: "tenant.manage" }, async (_req: NextRequest, ctx) => {
  const tenant = await loadTenant(ctx, ctx.params.id);
  const dependencies = await Promise.all([
    ctx.db.query.products.findFirst({ where: eq(products.tenantId, tenant.id) }),
    ctx.db.query.teams.findFirst({ where: eq(teams.tenantId, tenant.id) }),
    ctx.db.query.users.findFirst({ where: eq(users.tenantId, tenant.id) }),
    ctx.db.query.tickets.findFirst({ where: eq(tickets.tenantId, tenant.id) }),
    ctx.db.query.customers.findFirst({ where: eq(customers.tenantId, tenant.id) }),
  ]);
  if (dependencies.some(Boolean)) {
    throw conflict("Tenant must be empty before it can be deleted");
  }
  await ctx.db.delete(tenants).where(eq(tenants.id, tenant.id));
  return ok({ deleted: true });
});
