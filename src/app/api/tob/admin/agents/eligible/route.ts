import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { agents, users } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withAuth, parseQuery } from "@/lib/api/handler";
import { tenantCondition } from "@/lib/api/scope";
import {
  STAFF_SCOPES,
  assertCanManageStaff,
  parseStaffScope,
} from "@/lib/staff-scope";

const querySchema = z.object({
  scope: z.enum(STAFF_SCOPES).optional(),
  tenantId: z.string().optional(),
  productId: z.string().optional(),
});

export const GET = withAuth({ permission: "team.manage" }, async (req: NextRequest, ctx) => {
  const ref = await assertCanManageStaff(ctx, parseStaffScope(parseQuery(req, querySchema)));
  const userFilter =
    ref.scope === "system"
      ? undefined
      : ctx.isSuperAdmin && ref.tenantId
        ? eq(users.tenantId, ref.tenantId)
        : tenantCondition(ctx, users.tenantId);
  const userList = await ctx.db.select().from(users).where(userFilter);
  const agentRows = await ctx.db.select({ userId: agents.userId }).from(agents);
  const agentIds = new Set(agentRows.map((row) => row.userId));
  return ok(
    userList.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      isAgent: agentIds.has(user.id),
    }))
  );
});
