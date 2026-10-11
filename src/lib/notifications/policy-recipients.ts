import type { NotificationRequirementRow, NotificationRuleRow } from "@/drizzle/schema";
import type { NotificationPolicyScope } from "./policy-scope";

/** Preserve a team's all-agent audience when copying its policy into a product. */
export function ruleTargetForScope(
  rule: Pick<NotificationRuleRow, "scope" | "teamId" | "recipientType" | "recipientTeamId" | "recipientUserId">,
  scope: NotificationPolicyScope["scope"],
) {
  return rule.scope === "team" && scope === "product" && rule.recipientType === "product_agents"
    ? { recipientType: "team" as const, recipientTeamId: rule.teamId, recipientUserId: null }
    : { recipientType: rule.recipientType, recipientTeamId: rule.recipientTeamId, recipientUserId: rule.recipientUserId };
}

export function requirementTargetForScope(
  requirement: Pick<NotificationRequirementRow, "scope" | "teamId" | "scopeType" | "scopeTeamId" | "scopeUserId">,
  scope: NotificationPolicyScope["scope"],
) {
  return requirement.scope === "team" && scope === "product" && requirement.scopeType === "product"
    ? { scopeType: "team" as const, scopeTeamId: requirement.teamId, scopeUserId: null }
    : { scopeType: requirement.scopeType, scopeTeamId: requirement.scopeTeamId, scopeUserId: requirement.scopeUserId };
}

/** Shared by effective compliance and delivery; the audience is already live and scope-filtered. */
export function requirementTargetsAgent(
  requirement: NotificationRequirementRow,
  agent: { userId: string; teamIds: string[] },
) {
  if (requirement.scopeType === "user") return agent.userId === requirement.scopeUserId;
  if (requirement.scopeType === "team") return Boolean(requirement.scopeTeamId && agent.teamIds.includes(requirement.scopeTeamId));
  return requirement.scopeType === "product" && (
    requirement.scope !== "team" || Boolean(requirement.teamId && agent.teamIds.includes(requirement.teamId))
  );
}
