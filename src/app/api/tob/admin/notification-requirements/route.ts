import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { notificationRequirements } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { parseBody, parseQuery, withAuth } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { toNotificationRequirementView } from "@/lib/notifications/policy-schema";
import {
  requirementFieldsSchema,
  validateRequirementTarget,
} from "./shared";

const querySchema = z.object({ productId: z.string().min(1) });
const createSchema = requirementFieldsSchema.extend({
  productId: z.string().min(1),
});

export const GET = withAuth(
  { permission: "notification.manage" },
  async (req: NextRequest, ctx) => {
    const { productId } = parseQuery(req, querySchema);
    await assertProductAccess(ctx, productId);
    const rows = await ctx.db
      .select()
      .from(notificationRequirements)
      .where(eq(notificationRequirements.productId, productId));
    return ok(rows.map(toNotificationRequirementView));
  }
);

export const POST = withAuth(
  { permission: "notification.manage" },
  async (req: NextRequest, ctx) => {
    const body = await parseBody(req, createSchema);
    const target = await validateRequirementTarget(ctx, body.productId, body);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await ctx.db.insert(notificationRequirements).values({
      id,
      productId: body.productId,
      name: body.name,
      enabled: body.enabled ?? true,
      scopeType: body.scopeType,
      ...target,
      triggerEvents: JSON.stringify(body.triggerEvents),
      channelTypes: JSON.stringify(body.channelTypes),
      createdAt: now,
      updatedAt: now,
    });
    const created = await ctx.db.query.notificationRequirements.findFirst({
      where: eq(notificationRequirements.id, id),
    });
    return ok(
      created ? toNotificationRequirementView(created) : null,
      201
    );
  }
);
