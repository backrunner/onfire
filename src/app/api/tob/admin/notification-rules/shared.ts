import { eq } from "drizzle-orm";
import { z } from "zod";
import { notificationRules, type NotificationRuleRow } from "@/drizzle/schema";
import type { AuthedContext } from "@/lib/api/handler";
import { notFound } from "@/lib/api/response";
import { assertNotificationScope, validateNotificationTarget } from "@/lib/notifications/policy-access";
import { policyOwner, type NotificationPolicyScope } from "@/lib/notifications/policy-scope";
import { notificationChannelTypesSchema, notificationTriggerEventsSchema, notificationRecipientTypeSchema } from "@/lib/notifications/policy-schema";

export const ruleFieldsSchema = z.object({
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean().optional(),
  triggerEvents: notificationTriggerEventsSchema,
  channelTypes: notificationChannelTypesSchema,
  recipientType: notificationRecipientTypeSchema,
  recipientTeamId: z.string().min(1).nullable().optional(),
  recipientUserId: z.string().min(1).nullable().optional(),
});

export async function loadRule(ctx: AuthedContext, id: string) {
  const row = await ctx.db.query.notificationRules.findFirst({ where: eq(notificationRules.id, id) });
  if (!row) throw notFound("Notification rule not found");
  await assertNotificationScope(ctx, policyOwner(row));
  return row;
}

export async function validateRuleTarget(ctx: AuthedContext, owner: NotificationPolicyScope, body: z.infer<typeof ruleFieldsSchema>, previous?: NotificationRuleRow) {
  const target = {
    recipientTeamId: body.recipientType === "team" ? body.recipientTeamId ?? null : null,
    recipientUserId: body.recipientType === "user" ? body.recipientUserId ?? null : null,
  };
  // A disabled copy has no recipients. Retain a known target to mask inherited
  // policies or disable stale local policies; enabling/changing it revalidates.
  const disablingKnownTarget = body.enabled === false && previous &&
    body.recipientType === previous.recipientType &&
    target.recipientTeamId === previous.recipientTeamId &&
    target.recipientUserId === previous.recipientUserId;
  if (!disablingKnownTarget) await validateNotificationTarget(ctx, owner, body.recipientType, target.recipientTeamId, target.recipientUserId);
  return target;
}
