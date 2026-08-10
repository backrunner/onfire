import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  account,
  passkey,
  session,
  twoFactor,
  user as authUser,
} from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { createTestDb, uid } from "./test-db";

const authMocks = vi.hoisted(() => ({
  signUpEmail: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({
    api: { signUpEmail: authMocks.signUpEmail },
  }),
}));

const { createManagedAuthUser, deleteManagedAuthUser } =
  await import("@/lib/auth/managed-user");

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
  authMocks.signUpEmail.mockReset();
});

async function seedAuthUser(options?: { email?: string }) {
  const id = uid("auth-user");
  const now = new Date();
  const email = options?.email ?? `${id}@example.com`;
  await db.insert(authUser).values({
    id,
    name: "Managed User",
    email,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
  return { id, email, now };
}

describe("managed Better Auth users", () => {
  it("normalizes the email and returns the persisted Better Auth identity", async () => {
    authMocks.signUpEmail.mockImplementation(async ({ body }) => {
      const seeded = await seedAuthUser({ email: body.email });
      return {
        token: null,
        user: {
          id: seeded.id,
          email: body.email,
          name: body.name,
        },
      };
    });

    const result = await createManagedAuthUser(db, {
      email: "  USER@Example.COM ",
      password: "temporary-password",
      name: "Managed User",
    });

    expect(result.email).toBe("user@example.com");
    expect(authMocks.signUpEmail).toHaveBeenCalledWith({
      body: {
        email: "user@example.com",
        password: "temporary-password",
        name: "Managed User",
      },
    });
  });

  it("rejects an email already present in Better Auth", async () => {
    await seedAuthUser({ email: "existing@example.com" });

    await expect(
      createManagedAuthUser(db, {
        email: "existing@example.com",
        password: "temporary-password",
        name: "Existing",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(authMocks.signUpEmail).not.toHaveBeenCalled();
  });

  it("rejects a non-persisted synthetic duplicate response", async () => {
    authMocks.signUpEmail.mockResolvedValue({
      token: null,
      user: {
        id: uid("synthetic"),
        email: "duplicate@example.com",
        name: "Duplicate",
      },
    });

    await expect(
      createManagedAuthUser(db, {
        email: "duplicate@example.com",
        password: "temporary-password",
        name: "Duplicate",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("deletes sessions and credential accounts before the auth user", async () => {
    const seeded = await seedAuthUser();
    await db.insert(account).values({
      id: uid("account"),
      accountId: seeded.id,
      providerId: "credential",
      userId: seeded.id,
      password: "hash",
      createdAt: seeded.now,
      updatedAt: seeded.now,
    });
    await db.insert(session).values({
      id: uid("session"),
      token: uid("token"),
      userId: seeded.id,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: seeded.now,
      updatedAt: seeded.now,
    });
    await db.insert(passkey).values({
      id: uid("passkey"),
      name: "Laptop",
      publicKey: "public-key",
      userId: seeded.id,
      credentialID: uid("credential"),
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      createdAt: seeded.now,
    });
    await db.insert(twoFactor).values({
      id: uid("two-factor"),
      secret: "sealed-secret",
      backupCodes: "sealed-backup-codes",
      userId: seeded.id,
      verified: true,
    });

    await deleteManagedAuthUser(db, seeded.id);

    expect(
      await db.query.user.findFirst({ where: eq(authUser.id, seeded.id) }),
    ).toBeUndefined();
    expect(
      await db.query.account.findFirst({
        where: eq(account.userId, seeded.id),
      }),
    ).toBeUndefined();
    expect(
      await db.query.session.findFirst({
        where: eq(session.userId, seeded.id),
      }),
    ).toBeUndefined();
    expect(
      await db.query.passkey.findFirst({
        where: eq(passkey.userId, seeded.id),
      }),
    ).toBeUndefined();
    expect(
      await db.query.twoFactor.findFirst({
        where: eq(twoFactor.userId, seeded.id),
      }),
    ).toBeUndefined();
  });
});
