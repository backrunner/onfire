import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { tenants } from "@/drizzle/schema";
import { badRequest, forbidden, ok } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { Role } from "@/lib/types";

const createTenantSchema = z.object({
  name: z.string().trim().min(1).max(100),
  defaultTeamId: z.string().optional(),
});

export const GET = withAuth({}, async (_req: NextRequest, ctx) => {
  if (ctx.isSuperAdmin) {
    return ok(await ctx.db.select().from(tenants));
  }
  if (ctx.role === Role.TenantAdmin) {
    const tenantList = await ctx.db
      .select()
      .from(tenants)
      .where(eq(tenants.id, ctx.user.tenantId));
    return ok(tenantList);
  }
  throw forbidden("Tenant list is outside your scope");
});

export const POST = withAuth({ permission: "tenant.manage" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createTenantSchema);

  if (body.defaultTeamId) {
    throw badRequest("Set the default team after the tenant has been created");
  }

  const id = crypto.randomUUID();
  await ctx.db.insert(tenants).values({
    id,
    name: body.name,
  });

  const created = await ctx.db.query.tenants.findFirst({ where: eq(tenants.id, id) });
  return ok(created, 201);
});
