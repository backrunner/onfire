import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  agents,
  agentTeams,
  notificationRequirements,
  productTeams,
  teams,
  users,
} from "@/drizzle/schema";
import type { AuthedContext } from "@/lib/api/handler";
import { badRequest, notFound } from "@/lib/api/response";
import { assertProductAccess } from "@/lib/api/scope";
import {
  notificationChannelTypesSchema,
  notificationRequirementScopeSchema,
  notificationTriggerEventsSchema,
} from "@/lib/notifications/policy-schema";

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
  const requirement = await ctx.db.query.notificationRequirements.findFirst({
    where: eq(notificationRequirements.id, id),
  });
  if (!requirement) throw notFound("Notification requirement not found");
  await assertProductAccess(ctx, requirement.productId);
  return requirement;
}

export async function validateRequirementTarget(
  ctx: AuthedContext,
  productId: string,
  body: z.infer<typeof requirementFieldsSchema>
) {
  const product = await assertProductAccess(ctx, productId);
  if (body.scopeType === "team") {
    if (!body.scopeTeamId) throw badRequest("A required team is required");
    const association = await ctx.db
      .select({ teamId: productTeams.teamId })
      .from(productTeams)
      .innerJoin(teams, eq(teams.id, productTeams.teamId))
      .where(
        and(
          eq(productTeams.productId, productId),
          eq(productTeams.teamId, body.scopeTeamId),
          eq(teams.tenantId, product.tenantId)
        )
      )
      .get();
    if (!association) throw badRequest("Required team is not attached to this product");
  }
  if (body.scopeType === "user") {
    if (!body.scopeUserId) throw badRequest("A required agent is required");
    const target = await ctx.db
      .select({ userId: agents.userId })
      .from(agents)
      .innerJoin(users, eq(users.id, agents.userId))
      .innerJoin(agentTeams, eq(agentTeams.userId, agents.userId))
      .innerJoin(
        productTeams,
        and(
          eq(productTeams.teamId, agentTeams.teamId),
          eq(productTeams.productId, productId)
        )
      )
      .where(
        and(
          eq(agents.userId, body.scopeUserId),
          eq(agents.active, true),
          eq(users.tenantId, product.tenantId)
        )
      )
      .get();
    if (!target) throw badRequest("Required agent is not active for this product");
  }
  return {
    scopeTeamId: body.scopeType === "team" ? body.scopeTeamId : null,
    scopeUserId: body.scopeType === "user" ? body.scopeUserId : null,
  };
}
