import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { users } from "@/drizzle/schema";
import { getEnv } from "@/lib/db";
import { ApiError, forbidden, ok, notFound } from "@/lib/api/response";
import { withAuth, parseBody } from "@/lib/api/handler";
import {
  PREVIEW_COOKIE_NAME,
  PREVIEW_TTL_SECONDS,
  assertCanPreview,
  canStartPreview,
  previewCookieOptions,
  sealPreviewCookie,
} from "@/lib/preview-identity";

const startSchema = z.object({
  userId: z.string().min(1),
});

export const POST = withAuth({}, async (req: NextRequest, ctx) => {
  if (!canStartPreview(ctx.role)) {
    throw forbidden("Preview identity is SuperAdmin or TenantAdmin only");
  }
  const body = await parseBody(req, startSchema);
  const target = await ctx.db.query.users.findFirst({
    where: eq(users.id, body.userId),
  });
  if (!target) throw notFound("User not found");
  assertCanPreview(ctx, {
    id: target.id,
    role: target.role,
    tenantId: target.tenantId,
  });

  const secret = getEnv().AUTH_SECRET;
  if (!secret) {
    throw new ApiError(503, "Preview identity is unavailable");
  }
  const exp = Math.floor(Date.now() / 1000) + PREVIEW_TTL_SECONDS;
  const value = await sealPreviewCookie(
    { actorId: ctx.user.id, targetUserId: target.id, exp },
    secret
  );
  const response = ok({
    preview: {
      actor: {
        id: ctx.user.id,
        displayName: ctx.user.displayName,
        email: ctx.user.email,
        role: ctx.role,
      },
      target: {
        id: target.id,
        displayName: target.displayName,
        email: target.email,
        role: target.role,
      },
    },
  });
  response.cookies.set(
    PREVIEW_COOKIE_NAME,
    value,
    previewCookieOptions(PREVIEW_TTL_SECONDS, req.nextUrl.protocol === "https:")
  );
  return response;
});

export const DELETE = withAuth({}, async (req: NextRequest) => {
  const response = ok({ preview: null });
  response.cookies.set(
    PREVIEW_COOKIE_NAME,
    "",
    previewCookieOptions(0, req.nextUrl.protocol === "https:")
  );
  return response;
});
