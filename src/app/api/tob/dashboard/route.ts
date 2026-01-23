import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import {
  tickets,
  products,
  users,
  agentTeams,
  productTeams,
} from "@/drizzle/schema";
import { TicketStatus, hasPermission, Role } from "@/lib/types";
import { eq, inArray, and, or, desc } from "drizzle-orm";

async function resolveUserContext(db: ReturnType<typeof getDb>, userId: string) {
  const userProfile = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!userProfile) return null;

  const agentTeamRows = await db
    .select()
    .from(agentTeams)
    .where(eq(agentTeams.userId, userId));
  const teamIds = agentTeamRows.map((at) => at.teamId);

  let productIds: string[] = [];
  if (teamIds.length > 0) {
    const productTeamRows = await db
      .select()
      .from(productTeams)
      .where(inArray(productTeams.teamId, teamIds));
    productIds = [...new Set(productTeamRows.map((pt) => pt.productId))];
  }

  return {
    user: userProfile,
    tenantIds: [userProfile.tenantId],
    productIds,
    teamIds,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const db = getDb();
    const ctx = await resolveUserContext(db, session.user.id);

    if (!ctx) {
      return NextResponse.json(
        { ok: false, error: "User not found" },
        { status: 404 }
      );
    }

    if (!hasPermission(ctx.user.role as Role, "ticket.read")) {
      return NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    // Get all tickets for the user's tenants
    const allTickets = await db
      .select()
      .from(tickets)
      .where(inArray(tickets.tenantId, ctx.tenantIds));

    // Calculate stats
    const pendingCount = allTickets.filter(
      (t) =>
        t.status === TicketStatus.New || t.status === TicketStatus.Processing
    ).length;

    const escalatedCount = allTickets.filter(
      (t) => t.status === TicketStatus.Escalated
    ).length;

    const overdueCount = allTickets.filter(
      (t) => t.slaAcceptBreached || t.slaReplyBreached
    ).length;

    // Get product count
    const productList = await db
      .select()
      .from(products)
      .where(inArray(products.tenantId, ctx.tenantIds));

    // Get recent tickets
    const recentTickets = await db
      .select()
      .from(tickets)
      .where(inArray(tickets.tenantId, ctx.tenantIds))
      .orderBy(desc(tickets.createdAt))
      .limit(5);

    return NextResponse.json({
      ok: true,
      data: {
        stats: {
          pending: pendingCount,
          escalated: escalatedCount,
          overdue: overdueCount,
          products: productList.length,
        },
        recentTickets,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/tob/dashboard:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
