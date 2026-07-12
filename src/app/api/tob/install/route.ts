import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { users, tenants, teams } from "@/drizzle/schema";
import { Role } from "@/lib/types";
import { ok, badRequest, conflict } from "@/lib/api/response";
import { withPublic, parseBody } from "@/lib/api/handler";
import { clientIp, enforceRateLimit } from "@/lib/rate-limit";
import {
  createManagedAuthUser,
  deleteManagedAuthUser,
} from "@/lib/auth/managed-user";
import {
  acquireInstallLock,
  releaseInstallLock,
} from "@/lib/auth/install-lock";

function isMissingUsersTable(error: unknown): boolean {
  const message = String(error).toLowerCase();
  return message.includes("no such table") && /\busers\b/.test(message);
}

// GET /api/tob/install - Check if installation is needed
export const GET = withPublic(async (_req: NextRequest, ctx) => {
  let needsInstall: boolean;
  try {
    const existingUsers = await ctx.db.select().from(users).limit(1);
    needsInstall = existingUsers.length === 0;
  } catch (error) {
    if (isMissingUsersTable(error)) {
      needsInstall = true;
    } else {
      throw error;
    }
  }

  return ok({ needsInstall });
});

const installSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z
    .string()
    .min(8)
    .max(128)
    .refine((value) => /[A-Z]/.test(value), "Password must include an uppercase letter")
    .refine((value) => /[a-z]/.test(value), "Password must include a lowercase letter")
    .refine((value) => /[0-9]/.test(value), "Password must include a number"),
  displayName: z.string().trim().min(1).max(100).optional(),
  tenantName: z.string().trim().min(1).max(100),
});

// POST /api/tob/install - Complete installation
export const POST = withPublic(async (req: NextRequest, ctx) => {
  const db = ctx.db;

  await enforceRateLimit(
    db,
    req,
    "tob:install",
    { limit: 5, windowSeconds: 15 * 60 },
    clientIp(req)
  );

  // Check if already installed
  const existingUsers = await db.select().from(users).limit(1);
  if (existingUsers.length > 0) {
    throw badRequest("Already installed");
  }

  const { email, password, displayName, tenantName } = await parseBody(req, installSchema);
  const name = displayName || email.split("@")[0];

  if (!(await acquireInstallLock(db))) {
    throw conflict("Installation already in progress");
  }

  try {
    // Recheck after acquiring the lock. Another request may have completed
    // between the optimistic check above and this serialized section.
    const installed = await db.select({ id: users.id }).from(users).limit(1);
    if (installed.length > 0) throw badRequest("Already installed");

    const authUser = await createManagedAuthUser(db, {
      email,
      password,
      name,
    });

    const tenantId = crypto.randomUUID();
    const teamId = crypto.randomUUID();

    try {
      await db.batch([
        db.insert(tenants).values({
          id: tenantId,
          name: tenantName,
        }),
        db.insert(teams).values({
          id: teamId,
          tenantId,
          name: "Default Team",
          allowReassign: true,
        }),
        db
          .update(tenants)
          .set({ defaultTeamId: teamId })
          .where(eq(tenants.id, tenantId)),
        db.insert(users).values({
          id: authUser.id,
          email: authUser.email,
          displayName: name,
          tenantId,
          role: Role.SuperAdmin,
        }),
      ]);
    } catch (error) {
      try {
        await deleteManagedAuthUser(db, authUser.id);
      } catch (cleanupError) {
        console.error("Failed to roll back installation auth user:", cleanupError);
      }
      throw error;
    }

    return ok({
      userId: authUser.id,
      tenantId,
      teamId,
    });
  } finally {
    try {
      await releaseInstallLock(db);
    } catch (error) {
      console.error("Failed to release installation lock:", error);
    }
  }
});
