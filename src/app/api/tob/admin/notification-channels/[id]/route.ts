import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { notificationChannels } from "@/drizzle/schema";
import { ok, notFound, badRequest } from "@/lib/api/response";
import { withAuth, parseBody, type AuthedContext } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { getEnv } from "@/lib/db";
import {
  CHANNEL_SECRET_KEYS,
  sealChannelConfig,
  triggerEventsSchema,
  toChannelView,
  validateChannelConfig,
} from "@/lib/notifications/channel-schema";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
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

  let nextConfig: Record<string, unknown> | undefined;
  if (body.config !== undefined) {
    let existingConfig: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(channel.config || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        existingConfig = parsed as Record<string, unknown>;
      }
    } catch {
      existingConfig = {};
    }
    nextConfig = { ...existingConfig };
    for (const [key, value] of Object.entries(body.config)) {
      if (value === null) {
        delete nextConfig[key];
      } else if (
        typeof value === "string" &&
        value.trim() === "" &&
        CHANNEL_SECRET_KEYS.includes(key as (typeof CHANNEL_SECRET_KEYS)[number])
      ) {
        // A blank secret means "keep the configured value" during edits.
        continue;
      } else {
        nextConfig[key] = value;
      }
    }
    const configIssues = validateChannelConfig(channel.channelType, nextConfig);
    if (configIssues.length > 0) {
      throw badRequest("Invalid notification channel configuration", configIssues);
    }
    nextConfig = await sealChannelConfig(
      channel.id,
      nextConfig,
      getEnv().AUTH_SECRET
    );
  }

  await ctx.db
    .update(notificationChannels)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.enabled !== undefined && { enabled: body.enabled }),
      ...(nextConfig !== undefined && { config: JSON.stringify(nextConfig) }),
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
