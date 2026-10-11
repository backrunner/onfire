import { NextRequest } from "next/server";
import { ok } from "@/lib/api/response";
import { parseQuery, withAuth } from "@/lib/api/handler";
import { assertNotificationScope, loadNotificationAudience, assertNotificationOperation } from "@/lib/notifications/policy-access";
import { notificationScopeQuerySchema, policyBelongsTo } from "@/lib/notifications/policy-scope";
import { toNotificationRequirementView } from "@/lib/notifications/policy-schema";
import { requirementTargetsAgent } from "@/lib/notifications/policy-recipients";
import { loadEffectiveNotificationPolicies } from "@/services/notification/policies";

export const GET = withAuth({ permission: "notification.manage" }, async (req: NextRequest, ctx) => {
  const scope = await assertNotificationScope(ctx, parseQuery(req, notificationScopeQuerySchema));
  assertNotificationOperation(ctx, scope.owner, "get_notification_compliance");
  const [audience, effective] = await Promise.all([
    loadNotificationAudience(ctx.db, scope.owner),
    loadEffectiveNotificationPolicies(ctx.db, scope.owner, scope.contextTeamId),
  ]);
  const requirements = effective.requirements.filter(row => row.enabled).map(row => {
    const view = toNotificationRequirementView({ ...row, inherited: !policyBelongsTo(row, scope.owner) });
    const targets = audience.agents.filter(agent => requirementTargetsAgent(row, agent));
    const missing = targets.map(agent => ({ userId: agent.userId, displayName: agent.displayName,
      channelTypes: view.channelTypes.filter(type => !agent.channelTypes.includes(type as typeof agent.channelTypes[number])),
    })).filter(entry => entry.channelTypes.length > 0);
    return { ...view, targetCount: targets.length, missing };
  });
  return ok({ ...audience, scope: scope.owner, name: scope.name, chain: effective.chain, requirements });
});
