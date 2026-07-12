import { NextRequest } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import {
  users,
  user as authUser,
  account,
  session,
  agents,
  agentTeams,
  agentProfiles,
  aiChatMessages,
  products,
  tickets,
  userProducts,
} from "@/drizzle/schema";
import type { BatchItem } from "drizzle-orm/batch";
import { ok, notFound, forbidden, conflict } from "@/lib/api/response";
import { withAuth, parseBody, type AuthedContext } from "@/lib/api/handler";
import { canManageRole } from "@/lib/api-utils";
import { hasPermission, Role } from "@/lib/types";

const updateUserSchema = z.object({
  displayName: z.string().min(1).optional(),
  role: z.enum(Role).optional(),
  productIds: z.array(z.string().min(1)).optional(),
});

async function loadAccessibleUser(ctx: AuthedContext, id: string) {
  const user = await ctx.db.query.users.findFirst({ where: eq(users.id, id) });
  // 404 for cross-tenant access to avoid leaking user existence.
  if (!user || (!ctx.isSuperAdmin && !ctx.tenantIds.includes(user.tenantId))) {
    throw notFound("User not found");
  }
  return user;
}

export const GET = withAuth({ permission: "user.manage" }, async (_req: NextRequest, ctx) => {
  const user = await loadAccessibleUser(ctx, ctx.params.id);

  const agent = await ctx.db.query.agents.findFirst({
    where: eq(agents.userId, user.id),
  });
  const teamRows = await ctx.db
    .select({ teamId: agentTeams.teamId })
    .from(agentTeams)
    .where(eq(agentTeams.userId, user.id));
  const productRows = await ctx.db
    .select({ productId: userProducts.productId })
    .from(userProducts)
    .where(eq(userProducts.userId, user.id));

  return ok({
    ...user,
    isAgent: !!agent,
    agentLevel: agent?.level,
    agentActive: agent?.active,
    teamIds: teamRows.map((r) => r.teamId),
    productIds: productRows.map((r) => r.productId),
  });
});

export const PATCH = withAuth({ permission: "user.manage" }, async (req: NextRequest, ctx) => {
  const user = await loadAccessibleUser(ctx, ctx.params.id);
  const body = await parseBody(req, updateUserSchema);

  // A manager may not mutate a peer or superior, even through a harmless-
  // looking field such as displayName.
  if (!canManageRole(ctx.role, user.role)) {
    throw forbidden("Cannot modify user with equal or higher role");
  }
  if (body.role !== undefined) {
    if (!hasPermission(ctx.role, "role.manage")) {
      throw forbidden("Role management permission is required to change roles");
    }
    if (!canManageRole(ctx.role, body.role)) {
      throw forbidden("Cannot assign equal or higher role");
    }
  }

  const nextRole = body.role ?? user.role;
  const productIds = [...new Set(body.productIds ?? [])];
  if (nextRole === Role.ProductAdmin && body.productIds !== undefined) {
    if (productIds.length === 0) {
      throw forbidden("ProductAdmin requires at least one product");
    }
    const productRows = await ctx.db
      .select({ id: products.id, tenantId: products.tenantId })
      .from(products)
      .where(inArray(products.id, productIds));
    if (
      productRows.length !== productIds.length ||
      productRows.some((product) => product.tenantId !== user.tenantId)
    ) {
      throw forbidden("Products must belong to the user's tenant");
    }
  }
  if (
    nextRole === Role.ProductAdmin &&
    body.productIds === undefined &&
    user.role !== Role.ProductAdmin
  ) {
    throw forbidden("ProductAdmin requires at least one product");
  }

  const statements: BatchItem<"sqlite">[] = [
    ctx.db
      .update(users)
      .set({
        ...(body.displayName !== undefined && { displayName: body.displayName }),
        ...(body.role !== undefined && { role: body.role }),
      })
      .where(eq(users.id, user.id)),
  ];
  if (body.displayName !== undefined) {
    statements.push(
      ctx.db
        .update(authUser)
        .set({ name: body.displayName, updatedAt: new Date() })
        .where(eq(authUser.id, user.id))
    );
  }
  if (body.productIds !== undefined || nextRole !== Role.ProductAdmin) {
    statements.push(
      ctx.db.delete(userProducts).where(eq(userProducts.userId, user.id))
    );
    if (nextRole === Role.ProductAdmin && productIds.length > 0) {
      statements.push(
        ctx.db.insert(userProducts).values(
          productIds.map((productId) => ({ userId: user.id, productId }))
        )
      );
    }
  }
  await ctx.db.batch(
    statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]
  );

  const updated = await ctx.db.query.users.findFirst({ where: eq(users.id, user.id) });
  return ok(updated);
});

export const DELETE = withAuth({ permission: "user.manage" }, async (_req: NextRequest, ctx) => {
  const user = await loadAccessibleUser(ctx, ctx.params.id);
  if (!canManageRole(ctx.role, user.role)) {
    throw forbidden("Cannot delete user with equal or higher role");
  }

  const [assignedTicket] = await ctx.db
    .select({ id: tickets.id })
    .from(tickets)
    .where(eq(tickets.assigneeId, user.id))
    .limit(1);
  if (assignedTicket) {
    throw conflict("Reassign this user's tickets before deleting the account");
  }

  await ctx.db.batch([
    ctx.db.delete(agentTeams).where(eq(agentTeams.userId, user.id)),
    ctx.db.delete(userProducts).where(eq(userProducts.userId, user.id)),
    ctx.db.delete(agentProfiles).where(eq(agentProfiles.userId, user.id)),
    ctx.db.delete(agents).where(eq(agents.userId, user.id)),
    ctx.db.delete(aiChatMessages).where(eq(aiChatMessages.userId, user.id)),
    ctx.db.delete(users).where(eq(users.id, user.id)),
    ctx.db.delete(session).where(eq(session.userId, user.id)),
    ctx.db.delete(account).where(eq(account.userId, user.id)),
    ctx.db.delete(authUser).where(eq(authUser.id, user.id)),
  ]);

  return ok({ deleted: true });
});
