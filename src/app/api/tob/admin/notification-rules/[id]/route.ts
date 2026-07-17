import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { notificationRules } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { parseBody, withAuth } from "@/lib/api/handler";
import { toNotificationRuleView } from "@/lib/notifications/policy-schema";
import { loadRule, ruleFieldsSchema, validateRuleTarget } from "../shared";

const updateSchema = ruleFieldsSchema.partial();

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
    const target = await validateRuleTarget(ctx, rule.productId, merged);
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
    await ctx.db.delete(notificationRules).where(eq(notificationRules.id, rule.id));
    return ok({ deleted: true });
  }
);
