import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { tenants } from "@/drizzle/schema";
import { badRequest, ok } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";

const createTenantSchema = z.object({
  name: z.string().trim().min(1).max(100),
  defaultTeamId: z.string().optional(),
});

// "tenant.manage" is granted to SuperAdmin only, so no extra scoping is needed.
export const GET = withAuth({ permission: "tenant.manage" }, async (_req: NextRequest, ctx) => {
  const tenantList = await ctx.db.select().from(tenants);
  return ok(tenantList);
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
