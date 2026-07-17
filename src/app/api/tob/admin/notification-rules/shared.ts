import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  agents,
  agentTeams,
  notificationRules,
  productTeams,
  teams,
  users,
} from "@/drizzle/schema";
import type { AuthedContext } from "@/lib/api/handler";
import { badRequest, notFound } from "@/lib/api/response";
import { assertProductAccess } from "@/lib/api/scope";
import {
  notificationChannelTypesSchema,
  notificationRecipientTypeSchema,
  notificationTriggerEventsSchema,
} from "@/lib/notifications/policy-schema";

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
  const rule = await ctx.db.query.notificationRules.findFirst({
    where: eq(notificationRules.id, id),
  });
  if (!rule) throw notFound("Notification rule not found");
  await assertProductAccess(ctx, rule.productId);
  return rule;
}

export async function validateRuleTarget(
  ctx: AuthedContext,
  productId: string,
  body: z.infer<typeof ruleFieldsSchema>
) {
  const product = await assertProductAccess(ctx, productId);
  if (body.recipientType === "team") {
    if (!body.recipientTeamId) throw badRequest("A target team is required");
    const association = await ctx.db
      .select({ teamId: productTeams.teamId })
      .from(productTeams)
      .innerJoin(teams, eq(teams.id, productTeams.teamId))
      .where(
        and(
          eq(productTeams.productId, productId),
          eq(productTeams.teamId, body.recipientTeamId),
          eq(teams.tenantId, product.tenantId)
        )
      )
      .get();
    if (!association) throw badRequest("Target team is not attached to this product");
  }
  if (body.recipientType === "user") {
    if (!body.recipientUserId) throw badRequest("A target agent is required");
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
          eq(agents.userId, body.recipientUserId),
          eq(agents.active, true),
          eq(users.tenantId, product.tenantId)
        )
      )
      .get();
    if (!target) throw badRequest("Target agent is not active for this product");
  }
  return {
    recipientTeamId:
      body.recipientType === "team" ? body.recipientTeamId : null,
    recipientUserId:
      body.recipientType === "user" ? body.recipientUserId : null,
  };
}
