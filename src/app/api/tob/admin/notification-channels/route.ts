import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { notificationChannels } from "@/drizzle/schema";
import { ok } from "@/lib/api/response";
import { withAuth, parseBody, parseQuery } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import {
  channelTypeSchema,
  triggerEventsSchema,
  toChannelView,
} from "@/lib/notifications/channel-schema";

const querySchema = z.object({
  productId: z.string().min(1),
});

const createSchema = z.object({
  productId: z.string().min(1),
  channelType: channelTypeSchema,
  name: z.string().min(1).max(100),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()),
  triggerEvents: triggerEventsSchema,
});

export const GET = withAuth({ permission: "notification.manage" }, async (req: NextRequest, ctx) => {
  const { productId } = parseQuery(req, querySchema);
  await assertProductAccess(ctx, productId);

  const rows = await ctx.db
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.productId, productId));
  return ok(rows.map(toChannelView));
});

export const POST = withAuth({ permission: "notification.manage" }, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createSchema);
  await assertProductAccess(ctx, body.productId);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await ctx.db.insert(notificationChannels).values({
    id,
    productId: body.productId,
    channelType: body.channelType,
    name: body.name,
    enabled: body.enabled ?? true,
    config: JSON.stringify(body.config),
    triggerEvents: JSON.stringify(body.triggerEvents),
    createdAt: now,
    updatedAt: now,
  });

  const created = await ctx.db.query.notificationChannels.findFirst({
    where: eq(notificationChannels.id, id),
  });
  return ok(created ? toChannelView(created) : null, 201);
});
