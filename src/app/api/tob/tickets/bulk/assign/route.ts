import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { resolveUserContext } from "@/lib/api-utils";
import { tickets, history, agentTeams, agents } from "@/drizzle/schema";
import { hasPermission, Role, TicketStatus } from "@/lib/types";
import { eq, inArray, and } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
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

    const body = (await request.json()) as { ticketIds: string[]; assigneeId: string };

    if (!body.ticketIds || !Array.isArray(body.ticketIds) || body.ticketIds.length === 0) {
      return NextResponse.json({ ok: false, error: "ticketIds array is required" }, { status: 400 });
    }

    if (!body.assigneeId) {
      return NextResponse.json({ ok: false, error: "assigneeId is required" }, { status: 400 });
    }

    // Verify assignee exists and is active
    const assignee = await db
      .select({ userId: agents.userId })
      .from(agents)
      .where(and(eq(agents.userId, body.assigneeId), eq(agents.active, true)))
      .get();

    if (!assignee) {
      return NextResponse.json({ ok: false, error: "Assignee not found or inactive" }, { status: 400 });
    }

    // Get all tickets
    const ticketRows = await db
      .select()
      .from(tickets)
      .where(inArray(tickets.id, body.ticketIds));

    if (ticketRows.length === 0) {
      return NextResponse.json({ ok: false, error: "No tickets found" }, { status: 404 });
    }

    // Filter tickets by tenant access
    const accessibleTickets = ticketRows.filter((t) => ctx.tenantIds.includes(t.tenantId));

    if (accessibleTickets.length === 0) {
      return NextResponse.json({ ok: false, error: "No accessible tickets" }, { status: 403 });
    }

    const now = new Date().toISOString();
    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const ticket of accessibleTickets) {
      // Verify assignee is in the ticket's team
      const inTeam = await db
        .select()
        .from(agentTeams)
        .where(and(eq(agentTeams.userId, body.assigneeId), eq(agentTeams.teamId, ticket.teamId)))
        .get();

      if (!inTeam) {
        results.push({ id: ticket.id, success: false, error: "Assignee not in ticket team" });
        continue;
      }

      await db
        .update(tickets)
        .set({
          assigneeId: body.assigneeId,
          status: ticket.status === TicketStatus.New ? TicketStatus.Processing : ticket.status,
          updatedAt: now,
        })
        .where(eq(tickets.id, ticket.id));

      await db.insert(history).values({
        id: crypto.randomUUID(),
        ticketId: ticket.id,
        actorId: ctx.user.id,
        action: ticket.assigneeId ? "reassigned" : "assigned",
        snapshot: JSON.stringify({
          previousAssignee: ticket.assigneeId,
          newAssignee: body.assigneeId,
          bulk: true,
        }),
        createdAt: now,
      });

      results.push({ id: ticket.id, success: true });
    }

    return NextResponse.json({
      ok: true,
      data: {
        total: body.ticketIds.length,
        processed: results.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/tob/tickets/bulk/assign:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
