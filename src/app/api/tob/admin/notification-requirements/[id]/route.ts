import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { notificationRequirements } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { parseBody, withAuth } from "@/lib/api/handler";
import { toNotificationRequirementView } from "@/lib/notifications/policy-schema";
import {
  loadRequirement,
  requirementFieldsSchema,
  validateRequirementTarget,
} from "../shared";

const updateSchema = requirementFieldsSchema.partial();

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
      requirement.productId,
      merged
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
    await ctx.db
      .delete(notificationRequirements)
      .where(eq(notificationRequirements.id, requirement.id));
    return ok({ deleted: true });
  }
);
