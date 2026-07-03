import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { tenants } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";

const createTenantSchema = z.object({
  name: z.string().min(1),
  defaultTeamId: z.string().optional(),
});

// "tenant.manage" is granted to SuperAdmin only, so no extra scoping is needed.
export const GET = withAuth({ permission: "tenant.manage" }, async (_req: NextRequest, ctx) => {
  const tenantList = await ctx.db.select().from(tenants);
  return ok(tenantList);
});

export const POST = withAuth({ permission: "tenant.manage" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createTenantSchema);

  const id = crypto.randomUUID();
  await ctx.db.insert(tenants).values({
    id,
    name: body.name,
    defaultTeamId: body.defaultTeamId,
  });

  const created = await ctx.db.query.tenants.findFirst({ where: eq(tenants.id, id) });
  return ok(created, 201);
});
