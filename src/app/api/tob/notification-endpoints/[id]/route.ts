import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { notificationEndpoints } from "@/drizzle/schema";
import { getEnv } from "@/lib/db";
import { ok, badRequest, notFound } from "@/lib/api/response";
import {
  parseBody,
  withAuth,
  type AuthedContext,
} from "@/lib/api/handler";
import {
  CHANNEL_SECRET_KEYS,
  sealEndpointConfig,
  toEndpointView,
  validateChannelConfig,
} from "@/lib/notifications/channel-schema";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

async function loadOwnEndpoint(ctx: AuthedContext, id: string) {
  const endpoint = await ctx.db.query.notificationEndpoints.findFirst({
    where: and(
      eq(notificationEndpoints.id, id),
      eq(notificationEndpoints.userId, ctx.user.id)
    ),
  });
  if (!endpoint) throw notFound("Notification endpoint not found");
  return endpoint;
}

export const GET = withAuth({}, async (_req: NextRequest, ctx) => {
  return ok(toEndpointView(await loadOwnEndpoint(ctx, ctx.params.id)));
});

export const PATCH = withAuth({}, async (req: NextRequest, ctx) => {
  const endpoint = await loadOwnEndpoint(ctx, ctx.params.id);
  const body = await parseBody(req, updateSchema);
  let nextConfig: Record<string, unknown> | undefined;
  if (body.config !== undefined) {
    try {
      const parsed = JSON.parse(endpoint.config || "{}") as unknown;
      nextConfig =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? { ...(parsed as Record<string, unknown>) }
          : {};
    } catch {
      nextConfig = {};
    }
    for (const [key, value] of Object.entries(body.config)) {
      if (value === null) {
        delete nextConfig[key];
      } else if (
        typeof value === "string" &&
        value.trim() === "" &&
        CHANNEL_SECRET_KEYS.includes(
          key as (typeof CHANNEL_SECRET_KEYS)[number]
        )
      ) {
        continue;
      } else {
        nextConfig[key] = value;
      }
    }
    const configIssues = validateChannelConfig(
      endpoint.channelType,
      nextConfig
    );
    if (configIssues.length > 0) {
      throw badRequest(
        "Invalid notification endpoint configuration",
        configIssues
      );
    }
    nextConfig = await sealEndpointConfig(
      endpoint.id,
      nextConfig,
      getEnv().AUTH_SECRET
    );
  }
  await ctx.db
    .update(notificationEndpoints)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.enabled !== undefined && { enabled: body.enabled }),
      ...(nextConfig !== undefined && { config: JSON.stringify(nextConfig) }),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(notificationEndpoints.id, endpoint.id));
  const updated = await loadOwnEndpoint(ctx, endpoint.id);
  return ok(toEndpointView(updated));
});

export const DELETE = withAuth({}, async (_req: NextRequest, ctx) => {
  const endpoint = await loadOwnEndpoint(ctx, ctx.params.id);
  await ctx.db
    .delete(notificationEndpoints)
    .where(eq(notificationEndpoints.id, endpoint.id));
  return ok({ deleted: true });
});
