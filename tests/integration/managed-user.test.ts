import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  account,
  mcpOauthAuthorizations,
  mcpOauthGrants,
  oauthClient,
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

  it("deletes MCP grants and authorization bindings owned by the user", async () => {
    const seeded = await seedAuthUser();
    const clientId = uid("oauth-client");
    const grantId = uid("mcp-grant");
    const grantVersion = uid("mcp-grant-version");
    const authorizationCodeId = uid("authorization-code-hash");

    await db.insert(oauthClient).values({
      id: uid("oauth-client-row"),
      clientId,
      userId: seeded.id,
      redirectUris: ["http://127.0.0.1:9876/callback"],
      createdAt: seeded.now,
      updatedAt: seeded.now,
    });
    await db.insert(mcpOauthGrants).values({
      id: grantId,
      userId: seeded.id,
      clientId,
      permissions: ["tickets:read"],
      resourceMode: "all",
      tenantIds: [],
      productIds: [],
      version: grantVersion,
      createdAt: seeded.now.toISOString(),
      updatedAt: seeded.now.toISOString(),
    });
    await db.insert(mcpOauthAuthorizations).values({
      authorizationCodeId,
      userId: seeded.id,
      clientId,
      grantVersion,
      createdAt: seeded.now.toISOString(),
    });

    await deleteManagedAuthUser(db, seeded.id);

    expect(
      await db.query.mcpOauthGrants.findFirst({
        where: eq(mcpOauthGrants.id, grantId),
      }),
    ).toBeUndefined();
    expect(
      await db.query.mcpOauthAuthorizations.findFirst({
        where: eq(
          mcpOauthAuthorizations.authorizationCodeId,
          authorizationCodeId,
        ),
      }),
    ).toBeUndefined();
    expect(
      await db.query.oauthClient.findFirst({
        where: eq(oauthClient.clientId, clientId),
      }),
    ).toMatchObject({ userId: null });
  });
});
