import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { notificationChannels } from "@/drizzle/schema";
import { ok, notFound } from "@/lib/api/response";
import { withAuth, parseBody, type AuthedContext } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import {
  triggerEventsSchema,
  toChannelView,
} from "@/lib/notifications/channel-schema";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  triggerEvents: triggerEventsSchema.optional(),
});

async function loadChannel(ctx: AuthedContext, id: string) {
  const channel = await ctx.db.query.notificationChannels.findFirst({
    where: eq(notificationChannels.id, id),
  });
  if (!channel) throw notFound("Notification channel not found");
  await assertProductAccess(ctx, channel.productId);
  return channel;
}

export const GET = withAuth({ permission: "notification.manage" }, async (_req: NextRequest, ctx) => {
  const channel = await loadChannel(ctx, ctx.params.id);
  return ok(toChannelView(channel));
});

export const PATCH = withAuth({ permission: "notification.manage" }, async (req: NextRequest, ctx) => {
  const channel = await loadChannel(ctx, ctx.params.id);
  const body = await parseBody(req, updateSchema);

  await ctx.db
    .update(notificationChannels)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.enabled !== undefined && { enabled: body.enabled }),
      ...(body.config !== undefined && { config: JSON.stringify(body.config) }),
      ...(body.triggerEvents !== undefined && {
        triggerEvents: JSON.stringify(body.triggerEvents),
      }),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(notificationChannels.id, channel.id));

  const updated = await ctx.db.query.notificationChannels.findFirst({
    where: eq(notificationChannels.id, channel.id),
  });
  return ok(updated ? toChannelView(updated) : null);
});

export const DELETE = withAuth({ permission: "notification.manage" }, async (_req: NextRequest, ctx) => {
  const channel = await loadChannel(ctx, ctx.params.id);
  await ctx.db
    .delete(notificationChannels)
    .where(eq(notificationChannels.id, channel.id));
  return ok({ deleted: true });
});
