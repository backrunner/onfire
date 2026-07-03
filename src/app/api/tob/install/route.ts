import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { users, tenants, teams } from "@/drizzle/schema";
import { Role } from "@/lib/types";
import { ok, ApiError, badRequest } from "@/lib/api/response";
import { withPublic, parseBody } from "@/lib/api/handler";

// GET /api/tob/install - Check if installation is needed
export const GET = withPublic(async (_req: NextRequest, ctx) => {
  let needsInstall: boolean;
  try {
    const existingUsers = await ctx.db.select().from(users).limit(1);
    needsInstall = existingUsers.length === 0;
  } catch (error) {
    // If the table doesn't exist yet, installation is needed
    const errorMessage = String(error);
    if (errorMessage.includes("no such table") || errorMessage.includes("SQLITE_ERROR")) {
      needsInstall = true;
    } else {
      throw error;
    }
  }

  return ok({ needsInstall });
});

const installSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(100).optional(),
  tenantName: z.string().min(1).max(100),
});

// POST /api/tob/install - Complete installation
export const POST = withPublic(async (req: NextRequest, ctx) => {
  const db = ctx.db;
  const auth = getAuth();

  // Check if already installed
  const existingUsers = await db.select().from(users).limit(1);
  if (existingUsers.length > 0) {
    throw badRequest("Already installed");
  }

  const { email, password, displayName, tenantName } = await parseBody(req, installSchema);

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
    throw new ApiError(500, "Failed to create user");
  }

  // Create user profile with SuperAdmin role
  await db.insert(users).values({
    id: signUpResult.user.id,
    email,
    displayName: displayName || email.split("@")[0],
    tenantId,
    role: Role.SuperAdmin,
  });

  return ok({
    userId: signUpResult.user.id,
    tenantId,
    teamId,
  });
});
