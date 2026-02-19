import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { resolveUserContext } from "@/lib/api-utils";
import { tickets, history, agentTeams, agents } from "@/drizzle/schema";
import { hasPermission, Role, TicketStatus } from "@/lib/types";
import { eq, and } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const db = getDb();
    const ctx = await resolveUserContext(db, session.user.id);

    if (!ctx) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    if (!hasPermission(ctx.user.role as Role, "ticket.assign")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });

    if (!ticket) {
      return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 });
    }

    if (!ctx.tenantIds.includes(ticket.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as { assigneeId: string };

    if (!body.assigneeId) {
      return NextResponse.json({ ok: false, error: "assigneeId is required" }, { status: 400 });
    }

    // Verify assignee exists and is active
    const assignee = await db
      .select({ userId: agents.userId, level: agents.level })
      .from(agents)
      .where(and(eq(agents.userId, body.assigneeId), eq(agents.active, true)))
      .get();

    if (!assignee) {
      return NextResponse.json({ ok: false, error: "Assignee not found or inactive" }, { status: 400 });
    }

    // Verify assignee is in the ticket's team
    const inTeam = await db
      .select()
      .from(agentTeams)
      .where(and(eq(agentTeams.userId, body.assigneeId), eq(agentTeams.teamId, ticket.teamId)))
      .get();

    if (!inTeam) {
      return NextResponse.json({ ok: false, error: "Assignee not in ticket team" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const previousAssignee = ticket.assigneeId;

    await db
      .update(tickets)
      .set({
        assigneeId: body.assigneeId,
        status: ticket.status === TicketStatus.New ? TicketStatus.Processing : ticket.status,
        updatedAt: now,
      })
      .where(eq(tickets.id, id));

    await db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId: id,
      actorId: ctx.user.id,
      action: previousAssignee ? "reassigned" : "assigned",
      snapshot: JSON.stringify({
        previousAssignee,
        newAssignee: body.assigneeId,
      }),
      createdAt: now,
    });

    const updated = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });

    return NextResponse.json({ ok: true, data: { ticket: updated } });
  } catch (error) {
    console.error("Error in POST /api/tob/tickets/[id]/assign:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
