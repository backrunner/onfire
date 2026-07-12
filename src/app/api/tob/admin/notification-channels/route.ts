import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { notificationChannels } from "@/drizzle/schema";
import { ok, badRequest } from "@/lib/api/response";
import { withAuth, parseBody, parseQuery } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import {
  channelTypeSchema,
  sealChannelConfig,
  triggerEventsSchema,
  toChannelView,
  validateChannelConfig,
} from "@/lib/notifications/channel-schema";
import { getEnv } from "@/lib/db";

const querySchema = z.object({
  productId: z.string().min(1),
});

const createSchema = z.object({
  productId: z.string().min(1),
  channelType: channelTypeSchema,
  name: z.string().trim().min(1).max(100),
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

  const configIssues = validateChannelConfig(body.channelType, body.config);
  if (configIssues.length > 0) {
    throw badRequest("Invalid notification channel configuration", configIssues);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const sealedConfig = await sealChannelConfig(
    id,
    body.config,
    getEnv().AUTH_SECRET
  );

  await ctx.db.insert(notificationChannels).values({
    id,
    productId: body.productId,
    channelType: body.channelType,
    name: body.name,
    enabled: body.enabled ?? true,
    config: JSON.stringify(sealedConfig),
    triggerEvents: JSON.stringify(body.triggerEvents),
    createdAt: now,
    updatedAt: now,
  });

  const created = await ctx.db.query.notificationChannels.findFirst({
    where: eq(notificationChannels.id, id),
  });
  return ok(created ? toChannelView(created) : null, 201);
});
