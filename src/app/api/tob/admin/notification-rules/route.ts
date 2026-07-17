import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { notificationRules } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { parseBody, parseQuery, withAuth } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { toNotificationRuleView } from "@/lib/notifications/policy-schema";
import { ruleFieldsSchema, validateRuleTarget } from "./shared";

const querySchema = z.object({ productId: z.string().min(1) });
const createSchema = ruleFieldsSchema.extend({ productId: z.string().min(1) });

export const GET = withAuth(
  { permission: "notification.manage" },
  async (req: NextRequest, ctx) => {
    const { productId } = parseQuery(req, querySchema);
    await assertProductAccess(ctx, productId);
    const rows = await ctx.db
      .select()
      .from(notificationRules)
      .where(eq(notificationRules.productId, productId));
    return ok(rows.map(toNotificationRuleView));
  }
);

export const POST = withAuth(
  { permission: "notification.manage" },
  async (req: NextRequest, ctx) => {
    const body = await parseBody(req, createSchema);
    const target = await validateRuleTarget(ctx, body.productId, body);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await ctx.db.insert(notificationRules).values({
      id,
      productId: body.productId,
      name: body.name,
      enabled: body.enabled ?? true,
      triggerEvents: JSON.stringify(body.triggerEvents),
      channelTypes: JSON.stringify(body.channelTypes),
      recipientType: body.recipientType,
      ...target,
      createdAt: now,
      updatedAt: now,
    });
    const created = await ctx.db.query.notificationRules.findFirst({
      where: eq(notificationRules.id, id),
    });
    return ok(created ? toNotificationRuleView(created) : null, 201);
  }
);
