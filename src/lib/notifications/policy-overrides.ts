import type { AuthedContext } from "@/lib/api/handler";
import { badRequest, conflict } from "@/lib/api/response";
import { loadEffectiveNotificationPolicies } from "@/services/notification/policies";
import { policyBelongsTo, type NotificationPolicyScope } from "./policy-scope";

export async function validateNotificationOverride(ctx: AuthedContext, owner: NotificationPolicyScope, contextTeamId: string | undefined, overridesId: string | undefined, kind: "rule" | "requirement") {
  if (!overridesId) return null;
  const effective = await loadEffectiveNotificationPolicies(ctx.db, owner, contextTeamId);
  const rows = kind === "rule" ? effective.rules : effective.requirements;
  const parent = rows.find(row => (row.overridesId ?? row.id) === overridesId);
  if (parent && policyBelongsTo(parent, owner) && parent.overridesId) throw conflict("This policy already has an override in this scope; reload before editing");
  if (!parent || policyBelongsTo(parent, owner)) throw badRequest("Only an inherited notification policy can be overridden");
  return { overridesId, policy: parent };
}
