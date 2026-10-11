import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { notificationRequirements } from "@/drizzle/schema";
import { conflict, ok } from "@/lib/api/response";
import { parseBody, parseQuery, withAuth } from "@/lib/api/handler";
import { toNotificationRequirementView } from "@/lib/notifications/policy-schema";
import { notificationScopeFields, notificationScopeQuerySchema, policyBelongsTo } from "@/lib/notifications/policy-scope";
import { assertNotificationScope, notificationOwnership, assertNotificationOperation } from "@/lib/notifications/policy-access";
import { validateNotificationOverride } from "@/lib/notifications/policy-overrides";
import { notificationPolicyInsert } from "@/lib/notifications/policy-write";
import { loadEffectiveNotificationPolicies } from "@/services/notification/policies";
import { requirementFieldsSchema, validateRequirementTarget } from "./shared";

const createSchema = requirementFieldsSchema.extend({ ...notificationScopeFields, contextTeamId: z.string().min(1).optional(), overridesId: z.string().min(1).optional() }).strict();

export const GET = withAuth({ permission: "notification.manage" }, async (req: NextRequest, ctx) => {
  const scope = await assertNotificationScope(ctx, parseQuery(req, notificationScopeQuerySchema));
  assertNotificationOperation(ctx, scope.owner, "list_notification_requirements");
  const effective = await loadEffectiveNotificationPolicies(ctx.db, scope.owner, scope.contextTeamId);
  return ok(effective.requirements.map(row => toNotificationRequirementView({ ...row, inherited: !policyBelongsTo(row, scope.owner) })));
});

export const POST = withAuth({ permission: "notification.manage" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createSchema);
  const scope = await assertNotificationScope(ctx, body);
  assertNotificationOperation(ctx, scope.owner, "create_notification_requirement");
  const inherited = await validateNotificationOverride(ctx, scope.owner, scope.contextTeamId, body.overridesId, "requirement");
  const target = await validateRequirementTarget(ctx, scope.owner, body, inherited && "scopeType" in inherited.policy ? inherited.policy : undefined);
  const overridesId = inherited?.overridesId ?? null;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const inserted = await ctx.db.insert(notificationRequirements).select(notificationPolicyInsert(notificationRequirements, {
    id, ...notificationOwnership(scope.owner), overridesId,
    name: body.name, enabled: body.enabled ?? true,
    triggerEvents: JSON.stringify(body.triggerEvents), channelTypes: JSON.stringify(body.channelTypes),
    scopeType: body.scopeType, ...target, createdAt: now, updatedAt: now,
  }, overridesId)).onConflictDoNothing().returning({ id: notificationRequirements.id });
  if (!inserted.length) throw conflict("Policy changed or already has an override; reload before editing");
  const row = await ctx.db.query.notificationRequirements.findFirst({ where: eq(notificationRequirements.id, id) });
  return ok(row ? toNotificationRequirementView(row) : null, 201);
});
