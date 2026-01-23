import { NextRequest, NextResponse } from "next/server";
import { getDb, getEnv } from "@/lib/db";
import {
  tickets,
  replies,
  history,
  products,
  tenants,
  categoryRoutes,
  customers,
} from "@/drizzle/schema";
import { TicketStatus, TicketPriority } from "@/lib/types";
import { eq, and, desc } from "drizzle-orm";

// Helper to verify JWT token
async function verifyToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = JSON.parse(atob(parts[1]));

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// GET /api/toc/tickets - List customer tickets
export async function GET(request: NextRequest) {
  try {
    const payload = await verifyToken(request);
    if (!payload) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const db = getDb();
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId") || payload.productId;
    const status = searchParams.get("status") as TicketStatus | null;

    const where = [eq(tickets.customerEmail, payload.email)];
    if (productId) {
      where.push(eq(tickets.productId, productId));
    }
    if (status) {
      where.push(eq(tickets.status, status));
    }

    const ticketList = await db
      .select()
      .from(tickets)
      .where(and(...where))
      .orderBy(desc(tickets.createdAt))
      .limit(50);

    return NextResponse.json({
      ok: true,
      data: ticketList,
    });
  } catch (error) {
    console.error("Error in GET /api/toc/tickets:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/toc/tickets - Create a new ticket
export async function POST(request: NextRequest) {
  try {
    const payload = await verifyToken(request);
    if (!payload) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const db = getDb();
    const body = await request.json();
    const {
      productId,
      templateId,
      subject,
      content,
      priority = "medium",
      metadata,
      customer,
    } = body;

    if (!productId || !subject || !content) {
      return NextResponse.json(
        { ok: false, error: "productId, subject, and content are required" },
        { status: 400 }
      );
    }

    // Get product and tenant info
    const product = await db.query.products.findFirst({
      where: eq(products.id, productId),
    });

    if (!product) {
      return NextResponse.json(
        { ok: false, error: "Product not found" },
        { status: 404 }
      );
    }

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, product.tenantId),
    });

    if (!tenant) {
      return NextResponse.json(
        { ok: false, error: "Tenant not found" },
        { status: 404 }
      );
    }

    // Determine team based on category routing or default
    let teamId = tenant.defaultTeamId;
    if (metadata?.category) {
      const route = await db.query.categoryRoutes.findFirst({
        where: and(
          eq(categoryRoutes.productId, productId),
          eq(categoryRoutes.category, metadata.category)
        ),
      });
      if (route) {
        teamId = route.teamId;
      }
    }

    if (!teamId) {
      return NextResponse.json(
        { ok: false, error: "No team available for this product" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const ticketId = crypto.randomUUID();

    // Calculate SLA deadlines
    const priorityKey = priority as TicketPriority;
    const slaAcceptMinutes =
      priorityKey === "high"
        ? product.slaHighAccept
        : priorityKey === "medium"
          ? product.slaMediumAccept
          : product.slaLowAccept;
    const slaReplyMinutes =
      priorityKey === "high"
        ? product.slaHighReply
        : priorityKey === "medium"
          ? product.slaMediumReply
          : product.slaLowReply;

    const slaAcceptDeadline = slaAcceptMinutes
      ? new Date(Date.now() + slaAcceptMinutes * 60 * 1000).toISOString()
      : null;
    const slaReplyDeadline = slaReplyMinutes
      ? new Date(Date.now() + slaReplyMinutes * 60 * 1000).toISOString()
      : null;

    // Create ticket
    await db.insert(tickets).values({
      id: ticketId,
      tenantId: product.tenantId,
      productId,
      teamId,
      status: TicketStatus.New,
      priority: priorityKey,
      subject,
      content,
      customerEmail: customer?.email || payload.email,
      customerLevel: customer?.level || payload.level,
      templateId,
      metadata: metadata ? JSON.stringify(metadata) : null,
      slaAcceptDeadline,
      slaReplyDeadline,
      source: "api",
      createdAt: now,
      updatedAt: now,
    });

    // Create history entry
    await db.insert(history).values({
      id: crypto.randomUUID(),
      ticketId,
      action: "created",
      snapshot: JSON.stringify({ source: "api" }),
      createdAt: now,
    });

    // Update or create customer record
    const existingCustomer = await db.query.customers.findFirst({
      where: and(
        eq(customers.productId, productId),
        eq(customers.email, customer?.email || payload.email)
      ),
    });

    if (!existingCustomer) {
      await db.insert(customers).values({
        id: crypto.randomUUID(),
        tenantId: product.tenantId,
        productId,
        email: customer?.email || payload.email,
        externalId: customer?.externalId || payload.externalId,
        level: customer?.level || payload.level,
        createdAt: now,
        updatedAt: now,
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        ticketId,
        status: TicketStatus.New,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/toc/tickets:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
