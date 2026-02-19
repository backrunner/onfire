import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { resolveUserContext } from "@/lib/api-utils";
import { tickets, products, teams } from "@/drizzle/schema";
import { eq, and, or, like, desc, sql, inArray } from "drizzle-orm";
import { TicketStatus, TicketPriority, hasPermission, Role } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const ctx = await resolveUserContext(db, session.user.id);

    if (!ctx) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    if (!hasPermission(ctx.user.role as Role, "ticket.read")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    // Search parameters
    const query = searchParams.get("q") || "";
    const status = searchParams.get("status") as TicketStatus | null;
    const priority = searchParams.get("priority") as TicketPriority | null;
    const productId = searchParams.get("productId");
    const teamId = searchParams.get("teamId");
    const assigneeId = searchParams.get("assigneeId");
    const customerEmail = searchParams.get("customerEmail");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const overdue = searchParams.get("overdue") === "true";
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20"), 100);

    // Build conditions
    const conditions = [];

    // Access control - limit to user's tenant
    if (ctx.tenantIds.length > 0) {
      conditions.push(inArray(tickets.tenantId, ctx.tenantIds));
    }

    // Text search (subject, content, customer email, ticket ID)
    if (query) {
      const searchPattern = `%${query}%`;
      conditions.push(
        or(
          like(tickets.subject, searchPattern),
          like(tickets.content, searchPattern),
          like(tickets.customerEmail, searchPattern),
          like(tickets.id, searchPattern)
        )
      );
    }

    // Status filter
    if (status) {
      conditions.push(eq(tickets.status, status));
    }

    // Priority filter
    if (priority) {
      conditions.push(eq(tickets.priority, priority));
    }

    // Product filter
    if (productId) {
      conditions.push(eq(tickets.productId, productId));
    }

    // Team filter
    if (teamId) {
      conditions.push(eq(tickets.teamId, teamId));
    }

    // Assignee filter
    if (assigneeId) {
      if (assigneeId === "unassigned") {
        conditions.push(sql`${tickets.assigneeId} IS NULL`);
      } else {
        conditions.push(eq(tickets.assigneeId, assigneeId));
      }
    }

    // Customer email filter
    if (customerEmail) {
      conditions.push(like(tickets.customerEmail, `%${customerEmail}%`));
    }

    // Date range filter
    if (dateFrom) {
      conditions.push(sql`${tickets.createdAt} >= ${dateFrom}`);
    }
    if (dateTo) {
      conditions.push(sql`${tickets.createdAt} <= ${dateTo}`);
    }

    // Overdue filter
    if (overdue) {
      conditions.push(
        or(
          eq(tickets.slaAcceptBreached, true),
          eq(tickets.slaReplyBreached, true)
        )
      );
    }

    // Execute query
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [ticketResults, countResult] = await Promise.all([
      db
        .select({
          id: tickets.id,
          subject: tickets.subject,
          status: tickets.status,
          priority: tickets.priority,
          customerEmail: tickets.customerEmail,
          productId: tickets.productId,
          teamId: tickets.teamId,
          assigneeId: tickets.assigneeId,
          slaAcceptBreached: tickets.slaAcceptBreached,
          slaReplyBreached: tickets.slaReplyBreached,
          createdAt: tickets.createdAt,
          updatedAt: tickets.updatedAt,
        })
        .from(tickets)
        .where(whereClause)
        .orderBy(desc(tickets.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ count: sql<number>`count(*)` })
        .from(tickets)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count || 0;

    // Get product and team names for results
    const productIdsFromResults = [...new Set(ticketResults.map((t) => t.productId))];
    const teamIdsFromResults = [...new Set(ticketResults.map((t) => t.teamId))];

    const [productList, teamList] = await Promise.all([
      productIdsFromResults.length > 0
        ? db
            .select({ id: products.id, name: products.name })
            .from(products)
            .where(inArray(products.id, productIdsFromResults))
        : [],
      teamIdsFromResults.length > 0
        ? db
            .select({ id: teams.id, name: teams.name })
            .from(teams)
            .where(inArray(teams.id, teamIdsFromResults))
        : [],
    ]);

    const productMap = new Map(productList.map((p) => [p.id, p.name]));
    const teamMap = new Map(teamList.map((t) => [t.id, t.name]));

    const results = ticketResults.map((ticket) => ({
      ...ticket,
      productName: productMap.get(ticket.productId) || "",
      teamName: teamMap.get(ticket.teamId) || "",
      isOverdue: ticket.slaAcceptBreached || ticket.slaReplyBreached,
    }));

    return NextResponse.json({
      ok: true,
      data: {
        tickets: results,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error("Error in GET /api/tob/search:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
