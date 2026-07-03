import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { users, agents, agentTeams } from "@/drizzle/schema";
import { ok, badRequest, forbidden } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { tenantCondition } from "@/lib/api/scope";
import { canManageRole } from "@/lib/api-utils";
import { Role } from "@/lib/types";

const createUserSchema = z.object({
  email: z.string().min(1),
  displayName: z.string().min(1),
  role: z.enum(Role),
  tenantId: z.string().optional(),
});

export const GET = withAuth({ permission: "user.manage" }, async (_req: NextRequest, ctx) => {
  const userList = await ctx.db
    .select()
    .from(users)
    .where(tenantCondition(ctx, users.tenantId));

  const enrichedUsers = await Promise.all(
    userList.map(async (u) => {
      const agent = await ctx.db.query.agents.findFirst({
        where: eq(agents.userId, u.id),
      });
      const teamRows = await ctx.db
        .select({ teamId: agentTeams.teamId })
        .from(agentTeams)
        .where(eq(agentTeams.userId, u.id));
      return {
        ...u,
        isAgent: !!agent,
        agentLevel: agent?.level,
        agentActive: agent?.active,
        teamIds: teamRows.map((r) => r.teamId),
      };
    })
  );

  return ok(enrichedUsers);
});

export const POST = withAuth({ permission: "user.manage" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createUserSchema);

  // SuperAdmin may create a user in any tenant; others only in their own.
  const tenantId = body.tenantId ?? ctx.user.tenantId;
  if (!ctx.isSuperAdmin && !ctx.tenantIds.includes(tenantId)) {
    throw badRequest("Invalid tenantId");
  }

  // Prevent privilege escalation: users can only create users with lower roles.
  if (!canManageRole(ctx.role, body.role)) {
    throw forbidden("Cannot create user with equal or higher role");
  }

  const existing = await ctx.db.query.users.findFirst({
    where: eq(users.email, body.email),
  });
  if (existing) throw badRequest("Email already exists");

  const id = crypto.randomUUID();

  await ctx.db.insert(users).values({
    id,
    email: body.email,
    displayName: body.displayName,
    role: body.role,
    tenantId,
  });

  const created = await ctx.db.query.users.findFirst({ where: eq(users.id, id) });
  return ok(created, 201);
});
