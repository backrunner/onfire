import { NextRequest } from "next/server";
import { and, eq, notExists } from "drizzle-orm";
import { notificationRules } from "@/drizzle/schema";
import { conflict, ok } from "@/lib/api/response";
import { parseBody, withAuth } from "@/lib/api/handler";
import { toNotificationRuleView } from "@/lib/notifications/policy-schema";
import { loadRule, ruleFieldsSchema, validateRuleTarget } from "../shared";
import { assertNotificationOperation } from "@/lib/notifications/policy-access";
import { policyOwner } from "@/lib/notifications/policy-scope";

const updateSchema = ruleFieldsSchema.partial().strict();

export const GET = withAuth(
  { permission: "notification.manage" },
  async (_req: NextRequest, ctx) => {
    return ok(toNotificationRuleView(await loadRule(ctx, ctx.params.id)));
  }
);

export const PATCH = withAuth(
  { permission: "notification.manage" },
  async (req: NextRequest, ctx) => {
    const rule = await loadRule(ctx, ctx.params.id);
    assertNotificationOperation(ctx, policyOwner(rule), "update_notification_rule");
    const body = await parseBody(req, updateSchema);
    const currentEvents = JSON.parse(rule.triggerEvents) as string[];
    const currentChannels = JSON.parse(rule.channelTypes) as string[];
    const merged = ruleFieldsSchema.parse({
      name: body.name ?? rule.name,
      enabled: body.enabled ?? rule.enabled ?? true,
      triggerEvents: body.triggerEvents ?? currentEvents,
      channelTypes: body.channelTypes ?? currentChannels,
      recipientType: body.recipientType ?? rule.recipientType,
      recipientTeamId:
        body.recipientTeamId !== undefined
          ? body.recipientTeamId
          : rule.recipientTeamId,
      recipientUserId:
        body.recipientUserId !== undefined
          ? body.recipientUserId
          : rule.recipientUserId,
    });
    const target = await validateRuleTarget(ctx, policyOwner(rule), merged, rule);
    await ctx.db
      .update(notificationRules)
      .set({
        name: merged.name,
        enabled: merged.enabled ?? true,
        triggerEvents: JSON.stringify(merged.triggerEvents),
        channelTypes: JSON.stringify(merged.channelTypes),
        recipientType: merged.recipientType,
        ...target,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(notificationRules.id, rule.id));
    return ok(
      toNotificationRuleView(await loadRule(ctx, rule.id))
    );
  }
);

export const DELETE = withAuth(
  { permission: "notification.manage" },
  async (_req: NextRequest, ctx) => {
    const rule = await loadRule(ctx, ctx.params.id);
    assertNotificationOperation(ctx, policyOwner(rule), "delete_notification_rule");
    if (await ctx.db.query.notificationRules.findFirst({ where: eq(notificationRules.overridesId, rule.id) })) {
      throw conflict("Reset descendant overrides before deleting their original policy");
    }
    const deleted = await ctx.db.delete(notificationRules).where(and(
      eq(notificationRules.id, rule.id),
      notExists(ctx.db.select({ id: notificationRules.id }).from(notificationRules).where(eq(notificationRules.overridesId, rule.id))),
    )).returning({ id: notificationRules.id });
    if (!deleted.length) throw conflict("Policy changed; reload before deleting");
    return ok({ deleted: true });
  }
);
