import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";
import { notificationEndpoints } from "@/drizzle/schema";
import { parseBody, withAuth } from "@/lib/api/handler";
import { assertProductAccess } from "@/lib/api/scope";
import { badRequest, err, notFound, ok } from "@/lib/api/response";
import { sendEndpointTest } from "@/services/notification/test-endpoint";

const testSchema = z.object({
  productId: z.string().trim().min(1).optional(),
});

export const POST = withAuth({}, async (req: NextRequest, ctx) => {
  const body = await parseBody(req, testSchema);
  const endpoint = await ctx.db.query.notificationEndpoints.findFirst({
    where: and(
      eq(notificationEndpoints.id, ctx.params.id),
      eq(notificationEndpoints.userId, ctx.user.id)
    ),
  });
  if (!endpoint) throw notFound("Notification endpoint not found");

  if (endpoint.channelType === "email") {
    if (!body.productId) {
      throw badRequest("Select a product to test this email endpoint");
    }
    await assertProductAccess(ctx, body.productId);
  }

  const result = await sendEndpointTest(ctx.db, endpoint, body.productId);
  if (!result.success) return err(result.error ?? "Test notification failed", 502);
  return ok({ sent: true });
});
