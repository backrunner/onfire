import { and, eq, isNull } from "drizzle-orm";
import { products, teams } from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import type { AuthedContext } from "@/lib/api/handler";
import { badRequest, forbidden } from "@/lib/api/response";
import { assertProductAccess } from "@/lib/api/scope";
import { Role } from "@/lib/types";

export {
  canAccessManagement,
  canViewTenantConfiguration,
  managementEntryHref,
  type ManagementActor,
} from "./staff-access";

export const STAFF_SCOPES = ["system", "tenant", "product"] as const;
export type StaffScope = (typeof STAFF_SCOPES)[number];

export interface StaffScopeRef {
  scope: StaffScope;
  tenantId?: string | null;
  productId?: string | null;
}

export function parseStaffScope(input: {
  scope?: string;
  tenantId?: string;
  productId?: string;
}): StaffScopeRef {
  const scope = (STAFF_SCOPES as readonly string[]).includes(input.scope ?? "")
    ? (input.scope as StaffScope)
    : input.productId
      ? "product"
      : input.tenantId
        ? "tenant"
        : "system";
  return {
    scope,
    tenantId: input.tenantId,
    productId: input.productId,
  };
}

export async function fillStaffScope(
  db: Database,
  ref: StaffScopeRef
): Promise<StaffScopeRef> {
  if (ref.scope === "product" && ref.productId && !ref.tenantId) {
    const product = await db.query.products.findFirst({
      where: eq(products.id, ref.productId),
    });
    return { ...ref, tenantId: product?.tenantId ?? null };
  }
  return ref;
}

export async function assertCanManageStaff(
  ctx: AuthedContext,
  ref: StaffScopeRef
): Promise<StaffScopeRef> {
  const filled = await fillStaffScope(ctx.db, ref);
  if (filled.scope === "system") {
    if (!ctx.isSuperAdmin) throw forbidden("System staff settings are SuperAdmin-only");
    return filled;
  }
  if (filled.scope === "tenant") {
    const tenantId = filled.tenantId ?? ctx.user.tenantId;
    if (!tenantId) throw badRequest("Tenant is required");
    if (ctx.isSuperAdmin) return { ...filled, tenantId };
    if (ctx.role === Role.TenantAdmin && ctx.tenantIds.includes(tenantId)) {
      return { ...filled, tenantId };
    }
    throw forbidden("Tenant staff settings are outside your scope");
  }
  const productId = filled.productId;
  if (!productId) throw badRequest("Product is required");
  const product = await assertProductAccess(ctx, productId);
  if (
    ctx.isSuperAdmin ||
    ctx.role === Role.TenantAdmin ||
    ctx.role === Role.ProductAdmin
  ) {
    return { ...filled, tenantId: product.tenantId, productId };
  }
  throw forbidden("Product staff settings are outside your scope");
}

export function teamScopeFilter(ref: StaffScopeRef) {
  if (ref.scope === "product") {
    return and(eq(teams.scope, "product"), eq(teams.productId, ref.productId ?? ""));
  }
  if (ref.scope === "tenant") {
    return and(eq(teams.scope, "tenant"), eq(teams.tenantId, ref.tenantId ?? ""));
  }
  return and(eq(teams.scope, "system"), isNull(teams.tenantId));
}

export async function listScopedTeamIds(
  ctx: AuthedContext,
  ref: StaffScopeRef
): Promise<string[]> {
  const rows = await ctx.db.select({ id: teams.id }).from(teams).where(teamScopeFilter(ref));
  return rows.map((row) => row.id);
}

type TeamRecord = typeof teams.$inferSelect;

/** Mutations are limited to the caller's staff scope. Visibility stays broader. */
export function assertCanMutateTeam(ctx: AuthedContext, team: TeamRecord): void {
  if (ctx.isSuperAdmin) return;
  if (ctx.role === Role.TenantAdmin) {
    if (
      team.scope === "system" ||
      !team.tenantId ||
      !ctx.tenantIds.includes(team.tenantId)
    ) {
      throw forbidden("Team is outside your staff scope");
    }
    return;
  }
  if (ctx.role === Role.ProductAdmin) {
    if (
      team.scope !== "product" ||
      !team.productId ||
      !ctx.productIds.includes(team.productId)
    ) {
      throw forbidden("Team is outside your staff scope");
    }
    return;
  }
  throw forbidden("Team is outside your staff scope");
}
