import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { tickets, products } from "@/drizzle/schema";
import { TicketStatus, hasPermission, Role } from "@/lib/types";
import { eq, inArray, or, desc, sql, and } from "drizzle-orm";
import { resolveUserContext } from "@/lib/api-utils";

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

    // Use database aggregation instead of loading all tickets into memory
    const statsResult = await db
      .select({
        pending: sql<number>`COUNT(CASE WHEN ${tickets.status} IN ('new', 'processing') THEN 1 END)`,
        escalated: sql<number>`COUNT(CASE WHEN ${tickets.status} = 'escalated' THEN 1 END)`,
        overdue: sql<number>`COUNT(CASE WHEN ${tickets.slaAcceptBreached} = 1 OR ${tickets.slaReplyBreached} = 1 THEN 1 END)`,
      })
      .from(tickets)
      .where(inArray(tickets.tenantId, ctx.tenantIds));

    const stats = statsResult[0] || { pending: 0, escalated: 0, overdue: 0 };

    // Get product count
    const productCountResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(products)
      .where(inArray(products.tenantId, ctx.tenantIds));

    const productCount = productCountResult[0]?.count || 0;

    // Get recent tickets
    const recentTickets = await db
      .select()
      .from(tickets)
      .where(inArray(tickets.tenantId, ctx.tenantIds))
      .orderBy(desc(tickets.createdAt))
      .limit(5);

    const response = NextResponse.json({
      ok: true,
      data: {
        stats: {
          pending: Number(stats.pending),
          escalated: Number(stats.escalated),
          overdue: Number(stats.overdue),
          products: Number(productCount),
        },
        recentTickets,
      },
    });

    // Add cache headers for dashboard data (short TTL)
    response.headers.set("Cache-Control", "private, max-age=60");

    return response;
  } catch (error) {
    console.error("Error in GET /api/tob/dashboard:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
