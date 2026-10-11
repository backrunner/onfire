import { eq } from "drizzle-orm";
import { z } from "zod";
import { notificationRequirements, type NotificationRequirementRow } from "@/drizzle/schema";
import type { AuthedContext } from "@/lib/api/handler";
import { notFound } from "@/lib/api/response";
import { assertNotificationScope, validateNotificationTarget } from "@/lib/notifications/policy-access";
import { policyOwner, type NotificationPolicyScope } from "@/lib/notifications/policy-scope";
import { notificationChannelTypesSchema, notificationTriggerEventsSchema, notificationRequirementScopeSchema } from "@/lib/notifications/policy-schema";

export const requirementFieldsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean().optional(),
  scopeType: notificationRequirementScopeSchema,
  scopeTeamId: z.string().min(1).nullable().optional(),
  scopeUserId: z.string().min(1).nullable().optional(),
  triggerEvents: notificationTriggerEventsSchema,
  channelTypes: notificationChannelTypesSchema,
});

export async function loadRequirement(ctx: AuthedContext, id: string) {
  const row = await ctx.db.query.notificationRequirements.findFirst({ where: eq(notificationRequirements.id, id) });
  if (!row) throw notFound("Notification requirement not found");
  await assertNotificationScope(ctx, policyOwner(row));
  return row;
}

export async function validateRequirementTarget(ctx: AuthedContext, owner: NotificationPolicyScope, body: z.infer<typeof requirementFieldsSchema>, previous?: NotificationRequirementRow) {
  const target = {
    scopeTeamId: body.scopeType === "team" ? body.scopeTeamId ?? null : null,
    scopeUserId: body.scopeType === "user" ? body.scopeUserId ?? null : null,
  };
  const disablingKnownTarget = body.enabled === false && previous &&
    body.scopeType === previous.scopeType &&
    target.scopeTeamId === previous.scopeTeamId &&
    target.scopeUserId === previous.scopeUserId;
  if (!disablingKnownTarget) await validateNotificationTarget(ctx, owner, body.scopeType, target.scopeTeamId, target.scopeUserId);
  return target;
}
