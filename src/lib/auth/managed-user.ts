import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import {
  account,
  mcpOauthAuthorizations,
  mcpOauthGrants,
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  passkey,
  session,
  twoFactor,
  user as authUser,
} from "@/drizzle/schema";
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
  input: ManagedUserInput,
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
  userId: string,
): Promise<void> {
  await db.batch([
    db.delete(oauthAccessToken).where(eq(oauthAccessToken.userId, userId)),
    db.delete(oauthRefreshToken).where(eq(oauthRefreshToken.userId, userId)),
    db.delete(oauthConsent).where(eq(oauthConsent.userId, userId)),
    db
      .delete(mcpOauthAuthorizations)
      .where(eq(mcpOauthAuthorizations.userId, userId)),
    db.delete(mcpOauthGrants).where(eq(mcpOauthGrants.userId, userId)),
    db
      .update(oauthClient)
      .set({ userId: null })
      .where(eq(oauthClient.userId, userId)),
    db.delete(passkey).where(eq(passkey.userId, userId)),
    db.delete(twoFactor).where(eq(twoFactor.userId, userId)),
    db.delete(session).where(eq(session.userId, userId)),
    db.delete(account).where(eq(account.userId, userId)),
    db.delete(authUser).where(eq(authUser.id, userId)),
  ]);
}
