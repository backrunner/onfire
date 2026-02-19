import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { users, agentTeams, productTeams, products } from "@/drizzle/schema";
import { hasPermission, Role, Permission } from "@/lib/types";
import { eq, inArray } from "drizzle-orm";

// Role hierarchy for permission escalation checks
export const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.SuperAdmin]: 5,
  [Role.TenantAdmin]: 4,
  [Role.ProductAdmin]: 3,
  [Role.TeamAdmin]: 2,
  [Role.Agent]: 1,
};

/**
 * Check if the current user can manage a target role
 * Users can only manage roles lower than their own
 */
export function canManageRole(currentRole: Role, targetRole: Role): boolean {
  return ROLE_HIERARCHY[currentRole] > ROLE_HIERARCHY[targetRole];
}

/**
 * Check if the current user is SuperAdmin
 */
export function isSuperAdmin(role: Role): boolean {
  return role === Role.SuperAdmin;
}

export interface UserContext {
  user: typeof users.$inferSelect;
  tenantIds: string[];
  productIds: string[];
  teamIds: string[];
}

export async function resolveUserContext(
  db: ReturnType<typeof getDb>,
  userId: string
): Promise<UserContext | null> {
  const userProfile = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!userProfile) return null;

  const agentTeamRows = await db
    .select()
    .from(agentTeams)
    .where(eq(agentTeams.userId, userId));
  const teamIds = agentTeamRows.map((at) => at.teamId);

  let productIds: string[] = [];
  if (teamIds.length > 0) {
    const productTeamRows = await db
      .select()
      .from(productTeams)
      .where(inArray(productTeams.teamId, teamIds));
    productIds = [...new Set(productTeamRows.map((pt) => pt.productId))];
  }

  return {
    user: userProfile,
    tenantIds: [userProfile.tenantId],
    productIds,
    teamIds,
  };
}

export async function withAuth(
  request: NextRequest,
  requiredPermission: Permission,
  handler: (ctx: UserContext, db: ReturnType<typeof getDb>) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const ctx = await resolveUserContext(db, session.user.id);

    if (!ctx) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    if (!hasPermission(ctx.user.role as Role, requiredPermission)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    return await handler(ctx, db);
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Verify that a product belongs to one of the user's tenants
 */
export async function verifyProductOwnership(
  db: ReturnType<typeof getDb>,
  productId: string,
  tenantIds: string[]
): Promise<boolean> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });
  return product !== undefined && tenantIds.includes(product.tenantId);
}

/**
 * Get all product IDs that belong to the user's tenants
 */
export async function getAccessibleProductIds(
  db: ReturnType<typeof getDb>,
  tenantIds: string[]
): Promise<string[]> {
  if (tenantIds.length === 0) return [];
  const productList = await db
    .select({ id: products.id })
    .from(products)
    .where(inArray(products.tenantId, tenantIds));
  return productList.map((p) => p.id);
}
