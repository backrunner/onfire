import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import {
  tickets,
  replies,
  history,
  users,
  agentTeams,
  productTeams,
} from "@/drizzle/schema";
import { TicketStatus, hasPermission, Role } from "@/lib/types";
import { eq, inArray } from "drizzle-orm";

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

const enrichHistory = (rows: (typeof history.$inferSelect)[]) =>
  (rows ?? []).map((h) => ({
    ...h,
    snapshot: parseJson(h.snapshot),
  }));

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, id),
    });

    if (!ticket) {
      return NextResponse.json(
        { ok: false, error: "Ticket not found" },
        { status: 404 }
      );
    }

    if (!ctx.tenantIds.includes(ticket.tenantId)) {
      return NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const replyRows = await db
      .select()
      .from(replies)
      .where(eq(replies.ticketId, id))
      .orderBy(replies.createdAt);

    const historyRows = await db
      .select()
      .from(history)
      .where(eq(history.ticketId, id))
      .orderBy(history.createdAt);

    const timeline = [
      ...enrichHistory(historyRows).map((h) => ({ type: "history", ...h })),
      ...(replyRows ?? []).map((r) => ({ type: "reply", ...r })),
    ].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

    return NextResponse.json({
      ok: true,
      data: {
        ticket: enrichTicket(ticket),
        replies: replyRows,
        history: enrichHistory(historyRows),
        timeline,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/tob/tickets/[id]:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    if (!hasPermission(ctx.user.role as Role, "ticket.write")) {
      return NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const ticket = await db.query.tickets.findFirst({
      where: eq(tickets.id, id),
    });

    if (!ticket) {
      return NextResponse.json(
        { ok: false, error: "Ticket not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const now = new Date().toISOString();

    // Handle reply
    if (body.content) {
      const replyId = crypto.randomUUID();
      await db.insert(replies).values({
        id: replyId,
        ticketId: ticket.id,
        senderId: ctx.user.id,
        content: body.content,
        internal: body.internal ?? false,
        createdAt: now,
      });

      await db
        .update(tickets)
        .set({
          status: TicketStatus.Replied,
          updatedAt: now,
        })
        .where(eq(tickets.id, ticket.id));

      await db.insert(history).values({
        id: crypto.randomUUID(),
        ticketId: ticket.id,
        actorId: ctx.user.id,
        action: "agent_replied",
        createdAt: now,
      });

      const updated = await db.query.tickets.findFirst({
        where: eq(tickets.id, ticket.id),
      });

      return NextResponse.json({
        ok: true,
        data: {
          ticket: enrichTicket(updated),
          reply: { id: replyId, content: body.content, createdAt: now },
        },
      });
    }

    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error in POST /api/tob/tickets/[id]:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
