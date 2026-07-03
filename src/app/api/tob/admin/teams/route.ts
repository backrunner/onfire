import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { teams } from "@/drizzle/schema";
import { ok, badRequest } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { tenantCondition } from "@/lib/api/scope";

const createTeamSchema = z.object({
  name: z.string().min(1),
  tenantId: z.string().optional(),
  allowReassign: z.boolean().optional(),
});

export const GET = withAuth({ permission: "team.manage" }, async (_req: NextRequest, ctx) => {
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

  const id = crypto.randomUUID();

  await ctx.db.insert(teams).values({
    id,
    tenantId,
    name: body.name,
    allowReassign: body.allowReassign ?? true,
  });

  const created = await ctx.db.query.teams.findFirst({ where: eq(teams.id, id) });
  return ok(created, 201);
});
