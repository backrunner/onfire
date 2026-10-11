import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { notificationRules } from "@/drizzle/schema";
import { conflict, ok } from "@/lib/api/response";
import { parseBody, parseQuery, withAuth } from "@/lib/api/handler";
import { toNotificationRuleView } from "@/lib/notifications/policy-schema";
import { notificationScopeFields, notificationScopeQuerySchema, policyBelongsTo } from "@/lib/notifications/policy-scope";
import { assertNotificationScope, notificationOwnership, assertNotificationOperation } from "@/lib/notifications/policy-access";
import { validateNotificationOverride } from "@/lib/notifications/policy-overrides";
import { notificationPolicyInsert } from "@/lib/notifications/policy-write";
import { loadEffectiveNotificationPolicies } from "@/services/notification/policies";
import { ruleFieldsSchema, validateRuleTarget } from "./shared";

const createSchema = ruleFieldsSchema.extend({ ...notificationScopeFields, contextTeamId: z.string().min(1).optional(), overridesId: z.string().min(1).optional() }).strict();

export const GET = withAuth({ permission: "notification.manage" }, async (req: NextRequest, ctx) => {
  const scope = await assertNotificationScope(ctx, parseQuery(req, notificationScopeQuerySchema));
  assertNotificationOperation(ctx, scope.owner, "list_notification_rules");
  const effective = await loadEffectiveNotificationPolicies(ctx.db, scope.owner, scope.contextTeamId);
  return ok(effective.rules.map(row => toNotificationRuleView({ ...row, inherited: !policyBelongsTo(row, scope.owner) })));
});

export const POST = withAuth({ permission: "notification.manage" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createSchema);
  const scope = await assertNotificationScope(ctx, body);
  assertNotificationOperation(ctx, scope.owner, "create_notification_rule");
  const inherited = await validateNotificationOverride(ctx, scope.owner, scope.contextTeamId, body.overridesId, "rule");
  const target = await validateRuleTarget(ctx, scope.owner, body, inherited && "recipientType" in inherited.policy ? inherited.policy : undefined);
  const overridesId = inherited?.overridesId ?? null;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const inserted = await ctx.db.insert(notificationRules).select(notificationPolicyInsert(notificationRules, {
    id, ...notificationOwnership(scope.owner), overridesId,
    name: body.name, enabled: body.enabled ?? true,
    triggerEvents: JSON.stringify(body.triggerEvents), channelTypes: JSON.stringify(body.channelTypes),
    recipientType: body.recipientType, ...target, createdAt: now, updatedAt: now,
  }, overridesId)).onConflictDoNothing().returning({ id: notificationRules.id });
  if (!inserted.length) throw conflict("Policy changed or already has an override; reload before editing");
  const row = await ctx.db.query.notificationRules.findFirst({ where: eq(notificationRules.id, id) });
  return ok(row ? toNotificationRuleView(row) : null, 201);
});
