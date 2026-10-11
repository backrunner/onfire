import { and, eq, or, asc } from "drizzle-orm";
import { notificationRules, notificationRequirements, products, teams, type NotificationRuleRow, type NotificationRequirementRow } from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { policyBelongsTo, type NotificationPolicyScope, type PolicyOwnership } from "@/lib/notifications/policy-scope";

export function resolvePolicyLayers<T extends PolicyOwnership & { id: string }>(layers: readonly T[][]): T[] {
  const effective = new Map<string, T>();
  for (const layer of layers) {
    for (const row of layer) {
      const key = row.overridesId ?? row.id;
      // An override is relevant only when its ancestor is in this chain.
      if (!row.overridesId || effective.has(key)) effective.set(key, row);
    }
  }
  return [...effective.values()];
}

export async function notificationPolicyChain(db: Database, owner: NotificationPolicyScope, contextTeamId?: string): Promise<NotificationPolicyScope[]> {
  if (owner.scope === "tenant") return [owner];
  if (owner.scope === "team") {
    const team = await db.query.teams.findFirst({ where: eq(teams.id, owner.teamId) });
    return team?.tenantId ? [{ scope: "tenant", tenantId: team.tenantId }, owner] : [];
  }
  const product = await db.query.products.findFirst({ where: eq(products.id, owner.productId) });
  if (!product) return [];
  const chain: NotificationPolicyScope[] = [{ scope: "tenant", tenantId: product.tenantId }];
  if (contextTeamId) {
    const team = await db.query.teams.findFirst({ where: eq(teams.id, contextTeamId) });
    // Live tenant/product integrity applies even to historical ticket team IDs.
    if (team?.tenantId === product.tenantId && (team.scope !== "product" || team.productId === product.id)) {
      chain.push({ scope: "team", teamId: team.id });
    }
  }
  chain.push(owner);
  return chain;
}

export async function loadEffectiveNotificationPolicies(db: Database, owner: NotificationPolicyScope, contextTeamId?: string) {
  const chain = await notificationPolicyChain(db, owner, contextTeamId);
  if (!chain.length) return { rules: [] as NotificationRuleRow[], requirements: [] as NotificationRequirementRow[], chain };
  const ruleCondition = or(...chain.map(s => and(eq(notificationRules.scope, s.scope), s.scope === "tenant" ? eq(notificationRules.tenantId, s.tenantId) : s.scope === "team" ? eq(notificationRules.teamId, s.teamId) : eq(notificationRules.productId, s.productId))));
  const requirementCondition = or(...chain.map(s => and(eq(notificationRequirements.scope, s.scope), s.scope === "tenant" ? eq(notificationRequirements.tenantId, s.tenantId) : s.scope === "team" ? eq(notificationRequirements.teamId, s.teamId) : eq(notificationRequirements.productId, s.productId))));
  // Keep disabled ancestors and overrides until after resolution.
  const [rules, requirements] = await Promise.all([
    db.select().from(notificationRules).where(ruleCondition).orderBy(asc(notificationRules.createdAt), asc(notificationRules.id)),
    db.select().from(notificationRequirements).where(requirementCondition).orderBy(asc(notificationRequirements.createdAt), asc(notificationRequirements.id)),
  ]);
  return {
    rules: resolvePolicyLayers(chain.map(s => rules.filter(row => policyBelongsTo(row, s)))),
    requirements: resolvePolicyLayers(chain.map(s => requirements.filter(row => policyBelongsTo(row, s)))),
    chain,
  };
}
