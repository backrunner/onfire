import { and, inArray, or, type SQL, type AnyColumn } from "drizzle-orm";
import { eq } from "drizzle-orm";
import {
  agentTeams,
  productTeams,
  products,
  tenants,
  teams,
  tickets,
  type TicketRow,
} from "@/drizzle/schema";
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
const PRODUCT_SCOPED_ROLES = new Set([
  Role.ProductAdmin,
  Role.TeamAdmin,
  Role.Agent,
]);

export function isTeamScoped(ctx: AuthedContext): boolean {
  return TEAM_SCOPED_ROLES.has(ctx.role);
}

export function isProductScoped(ctx: AuthedContext): boolean {
  return PRODUCT_SCOPED_ROLES.has(ctx.role);
}

/** Whether an Agent currently belongs to any team that permits reassignment. */
export async function hasAgentReassignmentTeam(
  ctx: AuthedContext,
): Promise<boolean> {
  if (ctx.role !== Role.Agent) return false;

  const membership = await ctx.db
    .select({ teamId: agentTeams.teamId })
    .from(agentTeams)
    .innerJoin(teams, eq(teams.id, agentTeams.teamId))
    .where(
      and(
        eq(agentTeams.userId, ctx.user.id),
        eq(teams.tenantId, ctx.user.tenantId),
        eq(teams.allowReassign, true),
      ),
    )
    .get();
  return Boolean(membership);
}

/** Re-check the Agent-only team policy immediately before reassignment. */
export async function assertAgentMayReassign(
  ctx: AuthedContext,
  teamId: string,
): Promise<void> {
  if (ctx.role !== Role.Agent) {
    throw forbidden("Reassignment is not allowed for your role");
  }

  const membership = await ctx.db
    .select({ teamId: agentTeams.teamId })
    .from(agentTeams)
    .innerJoin(teams, eq(teams.id, agentTeams.teamId))
    .where(
      and(
        eq(agentTeams.userId, ctx.user.id),
        eq(agentTeams.teamId, teamId),
        eq(teams.tenantId, ctx.user.tenantId),
        eq(teams.allowReassign, true),
      ),
    )
    .get();
  if (!membership) {
    throw forbidden("Reassignment is not allowed for your role");
  }
}

function delegatedProductCondition(
  ctx: AuthedContext,
  tenantColumn: AnyColumn,
  productColumn: AnyColumn,
): SQL | undefined {
  const delegated = ctx.delegatedResourceScope;
  if (!delegated) return undefined;

  const conditions: SQL[] = [];
  if (delegated.tenantIds.length > 0) {
    conditions.push(inArray(tenantColumn, delegated.tenantIds));
  }
  if (delegated.productIds.length > 0) {
    conditions.push(inArray(productColumn, delegated.productIds));
  }
  return conditions.length > 0
    ? or(...conditions)
    : inArray(productColumn, ["__none__"]);
}

function delegatedAllowsProduct(
  ctx: AuthedContext,
  tenantId: string,
  productId: string,
): boolean {
  const delegated = ctx.delegatedResourceScope;
  return (
    !delegated ||
    delegated.tenantIds.includes(tenantId) ||
    delegated.productIds.includes(productId)
  );
}

/**
 * SQL condition restricting a tickets query to what the user may see.
 * Returns undefined for SuperAdmin (unrestricted).
 */
export function ticketScopeCondition(ctx: AuthedContext): SQL | undefined {
  const delegated = delegatedProductCondition(
    ctx,
    tickets.tenantId,
    tickets.productId,
  );
  if (ctx.isSuperAdmin) return delegated;

  const tenantCond = inArray(tickets.tenantId, ctx.tenantIds);
  if (isTeamScoped(ctx)) {
    if (ctx.teamIds.length === 0) {
      // No team membership → can see nothing. inArray with [] is invalid SQL,
      // so use an always-false condition.
      return and(
        tenantCond,
        inArray(tickets.teamId, ["__none__"]),
        delegated,
      );
    }
    return and(
      tenantCond,
      inArray(tickets.teamId, ctx.teamIds),
      delegated,
    );
  }
  if (isProductScoped(ctx)) {
    return and(
      tenantCond,
      inArray(
        tickets.productId,
        ctx.productIds.length ? ctx.productIds : ["__none__"],
      ),
      delegated,
    );
  }
  return and(tenantCond, delegated);
}

/**
 * Assert that a loaded ticket row is visible to the user; throws otherwise.
 * Uses 404 for cross-tenant access to avoid leaking ticket existence.
 */
export function assertTicketVisible(ctx: AuthedContext, ticket: TicketRow): void {
  if (!ctx.isSuperAdmin && !ctx.tenantIds.includes(ticket.tenantId)) {
    throw notFound("Ticket not found");
  }
  if (isTeamScoped(ctx) && !ctx.teamIds.includes(ticket.teamId)) {
    throw forbidden("Ticket belongs to another team");
  }
  if (ctx.role === Role.ProductAdmin && !ctx.productIds.includes(ticket.productId)) {
    throw forbidden("Ticket belongs to another product");
  }
  if (!delegatedAllowsProduct(ctx, ticket.tenantId, ticket.productId)) {
    throw notFound("Ticket not found");
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
  if (isProductScoped(ctx) && !ctx.productIds.includes(product.id)) {
    throw notFound("Product not found");
  }
  if (!delegatedAllowsProduct(ctx, product.tenantId, product.id)) {
    throw notFound("Product not found");
  }
  return product;
}

/** Assert visibility of a tenant-owned configuration record. */
export async function assertTenantAccess(
  ctx: AuthedContext,
  tenantId: string
): Promise<typeof tenants.$inferSelect> {
  const tenant = await ctx.db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });
  if (!tenant || (!ctx.isSuperAdmin && !ctx.tenantIds.includes(tenant.id))) {
    throw notFound("Tenant not found");
  }
  if (
    ctx.delegatedResourceScope &&
    !ctx.delegatedResourceScope.tenantIds.includes(tenant.id)
  ) {
    throw notFound("Tenant not found");
  }
  return tenant;
}

/** SQL condition for listing products within the current role's scope. */
export function productScopeCondition(ctx: AuthedContext): SQL | undefined {
  const delegated = delegatedProductCondition(
    ctx,
    products.tenantId,
    products.id,
  );
  if (ctx.isSuperAdmin) return delegated;
  const tenantCond = inArray(products.tenantId, ctx.tenantIds);
  if (!isProductScoped(ctx)) return and(tenantCond, delegated);
  return and(
    tenantCond,
    inArray(
      products.id,
      ctx.productIds.length ? ctx.productIds : ["__none__"],
    ),
    delegated,
  );
}

/**
 * ProductAdmin can manage teams attached to one of their products. Tenant and
 * super admins can manage every team in their tenant scope.
 */
export async function assertTeamAccess(
  ctx: AuthedContext,
  teamId: string
): Promise<typeof teams.$inferSelect> {
  const team = await ctx.db.query.teams.findFirst({ where: eq(teams.id, teamId) });
  if (!team || (!ctx.isSuperAdmin && !ctx.tenantIds.includes(team.tenantId))) {
    throw notFound("Team not found");
  }
  if (ctx.role === Role.ProductAdmin) {
    if (ctx.productIds.length === 0) throw notFound("Team not found");
    const association = await ctx.db
      .select({ teamId: productTeams.teamId })
      .from(productTeams)
      .where(
        and(
          eq(productTeams.teamId, teamId),
          inArray(productTeams.productId, ctx.productIds)
        )
      )
      .get();
    if (!association) throw notFound("Team not found");
  }
  if (isTeamScoped(ctx) && !ctx.teamIds.includes(teamId)) {
    throw notFound("Team not found");
  }
  const delegated = ctx.delegatedResourceScope;
  if (delegated && !delegated.tenantIds.includes(team.tenantId)) {
    if (delegated.productIds.length === 0) throw notFound("Team not found");
    const delegatedAssociation = await ctx.db
      .select({ teamId: productTeams.teamId })
      .from(productTeams)
      .where(
        and(
          eq(productTeams.teamId, teamId),
          inArray(productTeams.productId, delegated.productIds),
        ),
      )
      .get();
    if (!delegatedAssociation) throw notFound("Team not found");
  }
  return team;
}

/**
 * Tenant condition for arbitrary tenant-scoped tables.
 * Returns undefined for SuperAdmin.
 */
export function tenantCondition(
  ctx: AuthedContext,
  column: AnyColumn
): SQL | undefined {
  const delegated = ctx.delegatedResourceScope;
  if (ctx.isSuperAdmin) {
    return delegated
      ? inArray(column, delegated.tenantIds.length ? delegated.tenantIds : ["__none__"])
      : undefined;
  }
  return and(
    inArray(column, ctx.tenantIds),
    delegated
      ? inArray(column, delegated.tenantIds.length ? delegated.tenantIds : ["__none__"])
      : undefined,
  );
}
