import { and, inArray, type SQL, type AnyColumn } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { products, tickets, type TicketRow } from "@/drizzle/schema";
import { Role } from "@/lib/types";
import { forbidden, notFound } from "./response";
import type { AuthedContext } from "./handler";

/**
 * Data-domain visibility rules (in addition to the role permission matrix):
 *
 * - SuperAdmin     → all tenants
 * - TenantAdmin    → own tenant
 * - ProductAdmin   → own tenant (product-level pages further filter by productIds)
 * - TeamAdmin      → tickets of own teams
 * - Agent          → tickets of own teams
 */

const TEAM_SCOPED_ROLES = new Set([Role.TeamAdmin, Role.Agent]);

export function isTeamScoped(ctx: AuthedContext): boolean {
  return TEAM_SCOPED_ROLES.has(ctx.role);
}

/**
 * SQL condition restricting a tickets query to what the user may see.
 * Returns undefined for SuperAdmin (unrestricted).
 */
export function ticketScopeCondition(ctx: AuthedContext): SQL | undefined {
  if (ctx.isSuperAdmin) return undefined;

  const tenantCond = inArray(tickets.tenantId, ctx.tenantIds);
  if (isTeamScoped(ctx)) {
    if (ctx.teamIds.length === 0) {
      // No team membership → can see nothing. inArray with [] is invalid SQL,
      // so use an always-false condition.
      return and(tenantCond, inArray(tickets.teamId, ["__none__"]));
    }
    return and(tenantCond, inArray(tickets.teamId, ctx.teamIds));
  }
  return tenantCond;
}

/**
 * Assert that a loaded ticket row is visible to the user; throws otherwise.
 * Uses 404 for cross-tenant access to avoid leaking ticket existence.
 */
export function assertTicketVisible(ctx: AuthedContext, ticket: TicketRow): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.tenantIds.includes(ticket.tenantId)) {
    throw notFound("Ticket not found");
  }
  if (isTeamScoped(ctx) && !ctx.teamIds.includes(ticket.teamId)) {
    throw forbidden("Ticket belongs to another team");
  }
}

/**
 * Assert the user can administer the given product (config pages, keys,
 * templates, email settings…). Throws 404/403.
 */
export async function assertProductAccess(
  ctx: AuthedContext,
  productId: string
): Promise<{ id: string; tenantId: string }> {
  const product = await ctx.db.query.products.findFirst({
    where: eq(products.id, productId),
  });
  if (!product) throw notFound("Product not found");
  if (!ctx.isSuperAdmin && !ctx.tenantIds.includes(product.tenantId)) {
    throw notFound("Product not found");
  }
  return product;
}

/**
 * Tenant condition for arbitrary tenant-scoped tables.
 * Returns undefined for SuperAdmin.
 */
export function tenantCondition(
  ctx: AuthedContext,
  column: AnyColumn
): SQL | undefined {
  if (ctx.isSuperAdmin) return undefined;
  return inArray(column, ctx.tenantIds);
}
