import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { users, tenants, teams } from "@/drizzle/schema";
import { Role } from "@/lib/types";

// GET /api/tob/install/status - Check if installation is needed
export async function GET() {
  try {
    const db = getDb();

    // Check if any users exist
    const existingUsers = await db.select().from(users).limit(1);

    return NextResponse.json({
      ok: true,
      data: {
        needsInstall: existingUsers.length === 0,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/tob/install:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/tob/install/finalize - Complete installation
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const auth = getAuth();

    // Check if already installed
    const existingUsers = await db.select().from(users).limit(1);
    if (existingUsers.length > 0) {
      return NextResponse.json(
        { ok: false, error: "Already installed" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as {
      email?: string;
      password?: string;
      displayName?: string;
      tenantName?: string;
    };
    const { email, password, displayName, tenantName } = body;

    if (!email || !password || !tenantName) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Create tenant
    const tenantId = crypto.randomUUID();
    await db.insert(tenants).values({
      id: tenantId,
      name: tenantName,
    });

    // Create default team
    const teamId = crypto.randomUUID();
    await db.insert(teams).values({
      id: teamId,
      tenantId,
      name: "Default Team",
      allowReassign: true,
    });

    // Update tenant with default team
    await db
      .update(tenants)
      .set({ defaultTeamId: teamId })
      .where(eq(tenants.id, tenantId));

    // Create user via Better Auth
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name: displayName || email.split("@")[0],
      },
    });

    if (!signUpResult?.user) {
      return NextResponse.json(
        { ok: false, error: "Failed to create user" },
        { status: 500 }
      );
    }

    // Create user profile with SuperAdmin role
    await db.insert(users).values({
      id: signUpResult.user.id,
      email,
      displayName: displayName || email.split("@")[0],
      tenantId,
      role: Role.SuperAdmin,
    });

    return NextResponse.json({
      ok: true,
      data: {
        userId: signUpResult.user.id,
        tenantId,
        teamId,
      },
    });
  } catch (error) {
    console.error("Error in POST /api/tob/install:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Need to import eq for the update query
import { eq } from "drizzle-orm";
