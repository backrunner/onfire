import { and, eq, inArray, or } from "drizzle-orm";
import { agents, agentProfiles, agentTeams, notificationEndpoints, productTeams, products, teams, tenants, users } from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import type { AuthedContext } from "@/lib/api/handler";
import { badRequest, forbidden, notFound } from "@/lib/api/response";
import { assertProductAccess, assertTeamAccess, assertTenantAccess } from "@/lib/api/scope";
import { Role } from "@/lib/types";
import { notificationScopeQuerySchema, type NotificationPolicyScope } from "./policy-scope";
import { assertApiKeyPermission } from "@/lib/api-keys/auth";

export function assertNotificationOperation(ctx: AuthedContext, owner: NotificationPolicyScope, operation: string) {
  assertApiKeyPermission(ctx, owner.scope === "product" ? operation : `${owner.scope}_${operation}`);
}

export async function assertNotificationScope(ctx: AuthedContext, value: unknown) {
  const parsed = notificationScopeQuerySchema.safeParse(value);
  if (!parsed.success) throw badRequest("Invalid notification scope");
  const input = parsed.data;
  let owner: NotificationPolicyScope;
  let tenantId: string;
  let name: string;
  if (input.scope === "tenant") {
    if (!ctx.isSuperAdmin && ctx.role !== Role.TenantAdmin) throw forbidden("Tenant notification settings require a tenant administrator");
    const tenant = await assertTenantAccess(ctx, input.tenantId!);
    owner = { scope: "tenant", tenantId: tenant.id }; tenantId = tenant.id; name = tenant.name;
  } else if (input.scope === "team") {
    const team = await assertTeamAccess(ctx, input.teamId!);
    if (!team.tenantId) throw badRequest("System teams do not belong to a notification inheritance chain");
    if (ctx.role === Role.ProductAdmin && team.scope !== "product") throw forbidden("Shared team notification settings require a tenant or team administrator");
    if (ctx.delegatedResourceScope && !ctx.delegatedResourceScope.tenantIds.includes(team.tenantId) && team.scope !== "product") throw forbidden("Product delegation cannot modify shared team settings");
    if (team.scope === "product") {
      if (!team.productId) throw notFound("Team not found");
      await assertProductAccess(ctx, team.productId);
    }
    owner = { scope: "team", teamId: team.id }; tenantId = team.tenantId; name = team.name;
  } else {
    if (ctx.role === Role.TeamAdmin || ctx.role === Role.Agent) throw forbidden("Product notification settings require a product administrator");
    const product = await assertProductAccess(ctx, input.productId!);
    owner = { scope: "product", productId: product.id }; tenantId = product.tenantId;
    name = (await ctx.db.query.products.findFirst({ where: eq(products.id, product.id) }))!.name;
  }
  if (input.contextTeamId && owner.scope === "product") {
    const audience = await loadNotificationAudience(ctx.db, owner);
    if (!audience.teams.some(team => team.id === input.contextTeamId)) throw notFound("Team is not available for this product");
  }
  return { owner, tenantId, name, contextTeamId: input.contextTeamId };
}

export function notificationOwnership(owner: NotificationPolicyScope) {
  return { scope: owner.scope, tenantId: owner.scope === "tenant" ? owner.tenantId : null, teamId: owner.scope === "team" ? owner.teamId : null, productId: owner.scope === "product" ? owner.productId : null };
}

/** Live members, restricted to the owning tenant and the effective product. */
export async function loadNotificationAudience(db: Database, owner: NotificationPolicyScope) {
  let tenantId: string | null = null;
  let teamIds: string[] = [];
  if (owner.scope === "tenant") {
    tenantId = owner.tenantId;
    teamIds = (await db.select({ id: teams.id }).from(teams).where(eq(teams.tenantId, tenantId))).map(row => row.id);
  } else if (owner.scope === "team") {
    const team = await db.query.teams.findFirst({ where: eq(teams.id, owner.teamId) });
    tenantId = team?.tenantId ?? null; teamIds = team ? [team.id] : [];
  } else {
    const product = await db.query.products.findFirst({ where: eq(products.id, owner.productId) });
    tenantId = product?.tenantId ?? null;
    const associations = await db.select({ teamId: productTeams.teamId }).from(productTeams).where(eq(productTeams.productId, owner.productId));
    teamIds = associations.map(row => row.teamId);
    if (tenantId) {
      const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
      if (tenant?.defaultTeamId) teamIds.push(tenant.defaultTeamId);
    }
  }
  const teamRows = tenantId && teamIds.length ? await db.select().from(teams).where(and(
    inArray(teams.id, teamIds), eq(teams.tenantId, tenantId),
    owner.scope === "product" ? or(eq(teams.scope, "tenant"), and(eq(teams.scope, "product"), eq(teams.productId, owner.productId))) : undefined,
  )) : [];
  const memberships = teamRows.length ? await db.select({ userId: users.id, displayName: users.displayName, email: users.email, teamId: agentTeams.teamId })
    .from(agentTeams).innerJoin(agents, and(eq(agents.userId, agentTeams.userId), eq(agents.active, true)))
    .innerJoin(users, and(eq(users.id, agentTeams.userId), eq(users.tenantId, tenantId!)))
    .where(inArray(agentTeams.teamId, teamRows.map(team => team.id))) : [];
  const userIds = [...new Set(memberships.map(row => row.userId))];
  const [profiles, endpoints] = await Promise.all([
    userIds.length ? db.select().from(agentProfiles).where(inArray(agentProfiles.userId, userIds)) : Promise.resolve([]),
    userIds.length ? db.select({ userId: notificationEndpoints.userId, channelType: notificationEndpoints.channelType }).from(notificationEndpoints).where(and(inArray(notificationEndpoints.userId, userIds), eq(notificationEndpoints.enabled, true))) : Promise.resolve([]),
  ]);
  return { teams: teamRows.map(team => ({ id: team.id, name: team.name })), agents: userIds.map(userId => {
    const member = memberships.find(row => row.userId === userId)!;
    const profile = profiles.find(row => row.userId === userId);
    return { userId, displayName: profile?.displayName || member.displayName, email: profile?.email || member.email,
      teamIds: memberships.filter(row => row.userId === userId).map(row => row.teamId),
      channelTypes: [...new Set(endpoints.filter(row => row.userId === userId).map(row => row.channelType))] };
  }) };
}

export async function validateNotificationTarget(ctx: AuthedContext, owner: NotificationPolicyScope, kind: string, teamId?: string | null, userId?: string | null) {
  if (kind !== "team" && kind !== "user") return;
  const audience = await loadNotificationAudience(ctx.db, owner);
  if (kind === "team" && (!teamId || !audience.teams.some(team => team.id === teamId))) throw badRequest("Target team is not available in this notification scope");
  if (kind === "user" && (!userId || !audience.agents.some(agent => agent.userId === userId))) throw badRequest("Target agent is not active in this notification scope");
}
