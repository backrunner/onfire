import { and, desc, eq, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { mcpOauthGrants, oauthClient } from "@/drizzle/schema";
import { withAuth } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { hasAgentReassignmentTeam } from "@/lib/api/scope";
import { isUsableMcpGrant, parseStringArray } from "@/lib/mcp/grants";
import { effectiveMcpPermissions } from "@/lib/mcp/permissions";
import { withNoStoreHandler } from "@/lib/http-cache";

const listConnectedApplications = withAuth({}, async (_request: NextRequest, ctx) => {
  const [rows, agentReassignEnabled] = await Promise.all([
    ctx.db
      .select({ grant: mcpOauthGrants, client: oauthClient })
      .from(mcpOauthGrants)
      .innerJoin(oauthClient, eq(oauthClient.clientId, mcpOauthGrants.clientId))
      .where(
        and(
          eq(mcpOauthGrants.userId, ctx.user.id),
          isNull(mcpOauthGrants.revokedAt),
        ),
      )
      .orderBy(desc(mcpOauthGrants.updatedAt)),
    hasAgentReassignmentTeam(ctx),
  ]);

  return ok(
    rows
      .filter(({ grant }) => grant.revokedAt === null && isUsableMcpGrant(grant))
      .map(({ grant, client }) => {
        const permissions = parseStringArray(grant.permissions);
        return {
          id: grant.id,
          client: {
            id: client.clientId,
            name: client.name?.trim() || null,
            uri: client.uri ?? null,
          },
          permissions,
          effectivePermissions: effectiveMcpPermissions(
            ctx.role,
            permissions,
            { agentReassignEnabled },
          ),
          resourceMode: grant.resourceMode,
          tenantCount: parseStringArray(grant.tenantIds).length,
          productCount: parseStringArray(grant.productIds).length,
          createdAt: grant.createdAt,
          updatedAt: grant.updatedAt,
          lastUsedAt: grant.lastUsedAt,
        };
      }),
  );
});

export const GET = withNoStoreHandler(listConnectedApplications);
