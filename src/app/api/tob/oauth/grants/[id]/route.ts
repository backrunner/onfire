import { and, eq, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { mcpOauthGrants } from "@/drizzle/schema";
import { withAuth } from "@/lib/api/handler";
import { assertCanonicalTobOrigin } from "@/lib/auth/origin";
import { notFound, ok } from "@/lib/api/response";
import { revokeMcpGrant } from "@/lib/mcp/grants";
import { withNoStoreHandler } from "@/lib/http-cache";

const revokeConnectedApplication = withAuth({}, async (request: NextRequest, ctx) => {
  assertCanonicalTobOrigin(request, "connected-application revocation");
  const grant = await ctx.db.query.mcpOauthGrants.findFirst({
    where: and(
      eq(mcpOauthGrants.id, ctx.params.id),
      eq(mcpOauthGrants.userId, ctx.user.id),
      isNull(mcpOauthGrants.revokedAt),
    ),
  });
  if (!grant) throw notFound("Connected application not found");

  await revokeMcpGrant(ctx.db, grant);

  return ok({ revoked: true });
});

export const DELETE = withNoStoreHandler(revokeConnectedApplication);
