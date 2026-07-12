import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { account, session, user as authUser } from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { ApiError } from "@/lib/api/response";

export interface ManagedUserInput {
  email: string;
  password: string;
  name: string;
}

export interface ManagedAuthUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Create a Better Auth credential without exposing the public signup route.
 * The application profile must be written by the caller in the same D1
 * workflow; this helper only owns the authentication-side record.
 */
export async function createManagedAuthUser(
  db: Database,
  input: ManagedUserInput
): Promise<ManagedAuthUser> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  const existing = await db.query.user.findFirst({
    where: eq(authUser.email, email),
  });
  if (existing) throw new ApiError(409, "Email already exists");

  const result = await getAuth().api.signUpEmail({
    body: {
      email,
      password: input.password,
      name,
    },
  });

  if (!result?.user?.id) {
    throw new ApiError(500, "Failed to create authentication account");
  }

  // `autoSignIn` is disabled, but verify the returned record so a concurrent
  // duplicate signup cannot be mistaken for a newly provisioned account.
  const created = await db.query.user.findFirst({
    where: eq(authUser.id, result.user.id),
  });
  if (!created) throw new ApiError(409, "Email already exists");

  return {
    id: created.id,
    email: created.email,
    name: created.name,
  };
}

/** Remove every Better Auth record owned by an account. */
export async function deleteManagedAuthUser(
  db: Database,
  userId: string
): Promise<void> {
  await db.batch([
    db.delete(session).where(eq(session.userId, userId)),
    db.delete(account).where(eq(account.userId, userId)),
    db.delete(authUser).where(eq(authUser.id, userId)),
  ]);
}
