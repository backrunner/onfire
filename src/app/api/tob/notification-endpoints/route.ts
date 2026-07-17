import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { notificationEndpoints } from "@/drizzle/schema";
import { getEnv } from "@/lib/db";
import { ok, badRequest } from "@/lib/api/response";
import { parseBody, withAuth } from "@/lib/api/handler";
import {
  channelTypeSchema,
  sealEndpointConfig,
  toEndpointView,
  validateChannelConfig,
} from "@/lib/notifications/channel-schema";

const createSchema = z.object({
  channelType: channelTypeSchema,
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()),
});

export const GET = withAuth({}, async (_req: NextRequest, ctx) => {
  const rows = await ctx.db
    .select()
    .from(notificationEndpoints)
    .where(eq(notificationEndpoints.userId, ctx.user.id));
  return ok(rows.map(toEndpointView));
});

export const POST = withAuth({}, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, createSchema);
  const configIssues = validateChannelConfig(body.channelType, body.config);
  if (configIssues.length > 0) {
    throw badRequest("Invalid notification endpoint configuration", configIssues);
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const config = await sealEndpointConfig(
    id,
    body.config,
    getEnv().AUTH_SECRET
  );
  await ctx.db.insert(notificationEndpoints).values({
    id,
    userId: ctx.user.id,
    channelType: body.channelType,
    name: body.name,
    enabled: body.enabled ?? true,
    config: JSON.stringify(config),
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.query.notificationEndpoints.findFirst({
    where: eq(notificationEndpoints.id, id),
  });
  return ok(created ? toEndpointView(created) : null, 201);
});
