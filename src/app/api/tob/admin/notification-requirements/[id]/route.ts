import { NextRequest } from "next/server";
import { and, eq, notExists } from "drizzle-orm";
import { notificationRequirements } from "@/drizzle/schema";
import { conflict, ok } from "@/lib/api/response";
import { parseBody, withAuth } from "@/lib/api/handler";
import { toNotificationRequirementView } from "@/lib/notifications/policy-schema";
import {
  loadRequirement,
  requirementFieldsSchema,
  validateRequirementTarget,
} from "../shared";
import { assertNotificationOperation } from "@/lib/notifications/policy-access";
import { policyOwner } from "@/lib/notifications/policy-scope";

const updateSchema = requirementFieldsSchema.partial().strict();

export const GET = withAuth(
  { permission: "notification.manage" },
  async (_req: NextRequest, ctx) => {
    return ok(
      toNotificationRequirementView(
        await loadRequirement(ctx, ctx.params.id)
      )
    );
  }
);

export const PATCH = withAuth(
  { permission: "notification.manage" },
  async (req: NextRequest, ctx) => {
    const requirement = await loadRequirement(ctx, ctx.params.id);
    assertNotificationOperation(ctx, policyOwner(requirement), "update_notification_requirement");
    const body = await parseBody(req, updateSchema);
    const merged = requirementFieldsSchema.parse({
      name: body.name ?? requirement.name,
      enabled: body.enabled ?? requirement.enabled ?? true,
      scopeType: body.scopeType ?? requirement.scopeType,
      scopeTeamId:
        body.scopeTeamId !== undefined
          ? body.scopeTeamId
          : requirement.scopeTeamId,
      scopeUserId:
        body.scopeUserId !== undefined
          ? body.scopeUserId
          : requirement.scopeUserId,
      triggerEvents:
        body.triggerEvents ?? JSON.parse(requirement.triggerEvents),
      channelTypes:
        body.channelTypes ?? JSON.parse(requirement.channelTypes),
    });
    const target = await validateRequirementTarget(
      ctx,
      policyOwner(requirement),
      merged,
      requirement
    );
    await ctx.db
      .update(notificationRequirements)
      .set({
        name: merged.name,
        enabled: merged.enabled ?? true,
        scopeType: merged.scopeType,
        ...target,
        triggerEvents: JSON.stringify(merged.triggerEvents),
        channelTypes: JSON.stringify(merged.channelTypes),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(notificationRequirements.id, requirement.id));
    return ok(
      toNotificationRequirementView(
        await loadRequirement(ctx, requirement.id)
      )
    );
  }
);

export const DELETE = withAuth(
  { permission: "notification.manage" },
  async (_req: NextRequest, ctx) => {
    const requirement = await loadRequirement(ctx, ctx.params.id);
    assertNotificationOperation(ctx, policyOwner(requirement), "delete_notification_requirement");
    if (await ctx.db.query.notificationRequirements.findFirst({ where: eq(notificationRequirements.overridesId, requirement.id) })) {
      throw conflict("Reset descendant overrides before deleting their original policy");
    }
    const deleted = await ctx.db.delete(notificationRequirements).where(and(
      eq(notificationRequirements.id, requirement.id),
      notExists(ctx.db.select({ id: notificationRequirements.id }).from(notificationRequirements).where(eq(notificationRequirements.overridesId, requirement.id))),
    )).returning({ id: notificationRequirements.id });
    if (!deleted.length) throw conflict("Policy changed; reload before deleting");
    return ok({ deleted: true });
  }
);
