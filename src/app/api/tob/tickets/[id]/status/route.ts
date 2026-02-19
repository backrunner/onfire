import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { resolveUserContext } from "@/lib/api-utils";
import { tickets, history } from "@/drizzle/schema";
import { hasPermission, Role, TicketStatus } from "@/lib/types";
import { eq } from "drizzle-orm";

const validStatuses = Object.values(TicketStatus);

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

    if (!hasPermission(ctx.user.role as Role, "ticket.write")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const ticket = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });

    if (!ticket) {
      return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 });
    }

    if (!ctx.tenantIds.includes(ticket.tenantId)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as { status: TicketStatus };

    if (!body.status || !validStatuses.includes(body.status)) {
      return NextResponse.json(
        { ok: false, error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    if (ticket.status === body.status) {
      return NextResponse.json({ ok: false, error: "Status unchanged" }, { status: 400 });
    }

    // Validate status transitions
    if (ticket.status === TicketStatus.Closed && body.status !== TicketStatus.Closed) {
      return NextResponse.json({ ok: false, error: "Cannot reopen closed ticket" }, { status: 400 });
    }

    const now = new Date().toISOString();

    await db
      .update(tickets)
      .set({
        status: body.status,
        updatedAt: now,
      })
      .where(eq(tickets.id, id));

    await db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId: id,
      actorId: ctx.user.id,
      action: "status_changed",
      snapshot: JSON.stringify({
        previousStatus: ticket.status,
        newStatus: body.status,
      }),
      createdAt: now,
    });

    const updated = await db.query.tickets.findFirst({ where: eq(tickets.id, id) });

    return NextResponse.json({ ok: true, data: { ticket: updated } });
  } catch (error) {
    console.error("Error in POST /api/tob/tickets/[id]/status:", error);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
