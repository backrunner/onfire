import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, inArray, sql } from "drizzle-orm";
import {
  users,
  agents,
  agentTeams,
  products,
  tenants,
  userProducts,
  notificationEndpoints,
} from "@/drizzle/schema";
import { ok, badRequest, forbidden } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import { tenantCondition } from "@/lib/api/scope";
import { canManageRole } from "@/lib/api-utils";
import { hasPermission, Role } from "@/lib/types";
import {
  createManagedAuthUser,
  deleteManagedAuthUser,
} from "@/lib/auth/managed-user";
import { createDefaultEmailEndpoint } from "@/lib/notifications/default-email-endpoint";

const createUserSchema = z.object({
  email: z.string().trim().email().max(320),
  displayName: z.string().trim().min(1).max(100),
  temporaryPassword: z.string().min(8).max(128),
  role: z.enum(Role),
  tenantId: z.string().optional(),
  productIds: z.array(z.string().min(1)).optional(),
});

export const GET = withAuth({ permission: "user.manage" }, async (_req: NextRequest, ctx) => {
  const userList = await ctx.db
    .select()
    .from(users)
    .where(tenantCondition(ctx, users.tenantId));
  if (userList.length === 0) return ok([]);

  const userIds = userList.map((user) => user.id);
  const [agentRows, teamRows, productRows] = await Promise.all([
    ctx.db.select().from(agents).where(inArray(agents.userId, userIds)),
    ctx.db
      .select()
      .from(agentTeams)
      .where(inArray(agentTeams.userId, userIds)),
    ctx.db
      .select()
      .from(userProducts)
      .where(inArray(userProducts.userId, userIds)),
  ]);
  const agentByUser = new Map(agentRows.map((agent) => [agent.userId, agent]));
  const teamsByUser = new Map<string, string[]>();
  const productsByUser = new Map<string, string[]>();
  for (const row of teamRows) {
    teamsByUser.set(row.userId, [...(teamsByUser.get(row.userId) ?? []), row.teamId]);
  }
  for (const row of productRows) {
    productsByUser.set(row.userId, [
      ...(productsByUser.get(row.userId) ?? []),
      row.productId,
    ]);
  }

  const enrichedUsers = userList.map((user) => {
    const agent = agentByUser.get(user.id);
    return {
      ...user,
      isAgent: Boolean(agent),
      agentLevel: agent?.level,
      agentActive: agent?.active,
      teamIds: teamsByUser.get(user.id) ?? [],
      productIds: productsByUser.get(user.id) ?? [],
    };
  });

  return ok(enrichedUsers);
});

export const POST = withAuth({ permission: "user.manage" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createUserSchema);

  if (!hasPermission(ctx.role, "role.manage")) {
    throw forbidden("Role management permission is required to create users");
  }

  // SuperAdmin may create a user in any tenant; others only in their own.
  const tenantId = body.tenantId ?? ctx.user.tenantId;
  if (!ctx.isSuperAdmin && !ctx.tenantIds.includes(tenantId)) {
    throw badRequest("Invalid tenantId");
  }
  const tenant = await ctx.db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });
  if (!tenant) throw badRequest("Tenant not found");

  // Prevent privilege escalation: users can only create users with lower roles.
  if (!canManageRole(ctx.role, body.role)) {
    throw forbidden("Cannot create user with equal or higher role");
  }
  const productIds = [...new Set(body.productIds ?? [])];
  if (body.role !== Role.ProductAdmin && productIds.length > 0) {
    throw badRequest("Product scope is only valid for ProductAdmin users");
  }
  if (body.role === Role.ProductAdmin && productIds.length === 0) {
    throw badRequest("ProductAdmin requires at least one product");
  }
  if (productIds.length > 0) {
    const productRows = await ctx.db
      .select({ id: products.id, tenantId: products.tenantId })
      .from(products)
      .where(inArray(products.id, productIds));
    if (
      productRows.length !== productIds.length ||
      productRows.some((product) => product.tenantId !== tenantId)
    ) {
      throw badRequest("Products must belong to the user's tenant");
    }
  }

  const [existing] = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${body.email.toLowerCase()}`)
    .limit(1);
  if (existing) throw badRequest("Email already exists");

  const authUser = await createManagedAuthUser(ctx.db, {
    email: body.email,
    password: body.temporaryPassword,
    name: body.displayName,
  });

  try {
    const insertUser = ctx.db.insert(users).values({
      id: authUser.id,
      email: authUser.email,
      displayName: body.displayName,
      role: body.role,
      tenantId,
    });
    const insertDefaultEmailEndpoint = ctx.db
      .insert(notificationEndpoints)
      .values(createDefaultEmailEndpoint(authUser.id, authUser.email));
    if (body.role === Role.ProductAdmin) {
      await ctx.db.batch([
        insertUser,
        insertDefaultEmailEndpoint,
        ctx.db.insert(userProducts).values(
          productIds.map((productId) => ({ userId: authUser.id, productId }))
        ),
      ]);
    } else {
      await ctx.db.batch([insertUser, insertDefaultEmailEndpoint]);
    }
  } catch (error) {
    try {
      await deleteManagedAuthUser(ctx.db, authUser.id);
    } catch (cleanupError) {
      console.error("Failed to roll back Better Auth user:", cleanupError);
    }
    throw error;
  }

  const created = await ctx.db.query.users.findFirst({
    where: eq(users.id, authUser.id),
  });
  return ok(created, 201);
});
