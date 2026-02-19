import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { resolveUserContext } from "@/lib/api-utils";
import { tickets } from "@/drizzle/schema";
import {
  TicketStatus,
  TicketPriority,
  type TicketFilter,
  hasPermission,
  Role,
} from "@/lib/types";
import { and, desc, eq, inArray, or } from "drizzle-orm";

const parseJson = (val: string | null | undefined): unknown => {
  if (val === null || val === undefined) return undefined;
  if (typeof val !== "string") return val;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
};

const enrichTicket = (row: typeof tickets.$inferSelect | null | undefined) => {
  if (!row) return null;
  const acceptDeadline = row.slaAcceptDeadline
    ? Date.parse(row.slaAcceptDeadline)
    : undefined;
  const replyDeadline = row.slaReplyDeadline
    ? Date.parse(row.slaReplyDeadline)
    : undefined;
  const now = Date.now();
  const sla =
    row.slaAcceptDeadline || row.slaReplyDeadline
      ? {
          acceptDeadline: row.slaAcceptDeadline ?? undefined,
          replyDeadline: row.slaReplyDeadline ?? undefined,
          acceptBreached: acceptDeadline ? acceptDeadline < now : false,
          replyBreached: replyDeadline ? replyDeadline < now : false,
        }
      : undefined;
  return {
    ...row,
    metadata: parseJson(row.metadata),
    sla,
  };
};

const weightPriority: Record<string, number> = { high: 0, medium: 1, low: 2 };

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

    const { searchParams } = new URL(request.url);
    const filter: TicketFilter = {
      productId: searchParams.get("productId") ?? undefined,
      teamId: searchParams.get("teamId") ?? undefined,
      status: (searchParams.get("status") as TicketStatus) ?? undefined,
      priority: (searchParams.get("priority") as TicketPriority) ?? undefined,
      overdue:
        searchParams.get("overdue") === "true" ||
        searchParams.get("overdue") === "1",
    };

    const where = [];
    if (ctx.tenantIds.length)
      where.push(inArray(tickets.tenantId, ctx.tenantIds));
    if (filter.productId) where.push(eq(tickets.productId, filter.productId));
    if (filter.teamId) where.push(eq(tickets.teamId, filter.teamId));
    if (filter.status) where.push(eq(tickets.status, filter.status));
    if (filter.priority) where.push(eq(tickets.priority, filter.priority));
    if (filter.overdue)
      where.push(
        or(
          eq(tickets.slaAcceptBreached, true),
          eq(tickets.slaReplyBreached, true)
        )
      );

    const list = await db
      .select()
      .from(tickets)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(tickets.createdAt))
      .limit(100);

    const enriched = list.map(enrichTicket).filter(Boolean);
    enriched.sort((a, b) => {
      if (!a || !b) return 0;
      const wDiff =
        (weightPriority[a.priority] ?? 3) - (weightPriority[b.priority] ?? 3);
      if (wDiff !== 0) return wDiff;
      return (b.updatedAt ?? b.createdAt).localeCompare(
        a.updatedAt ?? a.createdAt
      );
    });

    return NextResponse.json({
      ok: true,
      data: { data: enriched, total: enriched.length },
    });
  } catch (error) {
    console.error("Error in GET /api/tob/tickets:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
