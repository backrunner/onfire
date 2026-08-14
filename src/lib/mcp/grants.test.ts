import { describe, expect, it, vi } from "vitest";
import {
  mcpOauthAuthorizations,
  mcpOauthGrants,
  oauthAccessToken,
  oauthConsent,
  oauthRefreshToken,
} from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { revokeMcpGrant, saveMcpGrant } from "@/lib/mcp/grants";

interface Statement {
  operation: "delete" | "insert" | "update";
  table: unknown;
  values?: unknown;
  onConflictDoUpdate?: () => Statement;
}

function batchDb() {
  const batch = vi.fn().mockResolvedValue([]);
  const db = {
    batch,
    delete: vi.fn((table: unknown) => ({
      where: vi.fn((): Statement => ({ operation: "delete", table })),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        const statement: Statement = { operation: "insert", table, values };
        statement.onConflictDoUpdate = vi.fn(() => statement);
        return statement;
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: unknown) => ({
        where: vi.fn((): Statement => ({ operation: "update", table, values })),
      })),
    })),
  };
  return { batch, db: db as unknown as Database };
}

describe("MCP grant token lifecycle", () => {
  it("replaces the grant and both token types in one batch", async () => {
    const { batch, db } = batchDb();

    await saveMcpGrant(db, {
      userId: "user-1",
      clientId: "client-1",
      authorizationCodeId: "code-hash-2",
      permissions: ["tickets:read", "settings:read"],
      resourceMode: "all",
      tenantIds: ["tenant-ignored"],
      productIds: ["product-ignored"],
    });

    expect(batch).toHaveBeenCalledOnce();
    const statements = batch.mock.calls[0]?.[0] as Statement[];
    expect(statements.map(({ operation, table }) => ({ operation, table }))).toEqual([
      { operation: "delete", table: oauthAccessToken },
      { operation: "delete", table: oauthRefreshToken },
      { operation: "delete", table: mcpOauthAuthorizations },
      { operation: "insert", table: mcpOauthGrants },
      { operation: "insert", table: mcpOauthAuthorizations },
    ]);
    expect(statements[3]?.values).toMatchObject({
      resourceMode: "all",
      tenantIds: [],
      productIds: [],
      version: expect.any(String),
    });
    expect(statements[4]?.values).toMatchObject({
      authorizationCodeId: "code-hash-2",
      userId: "user-1",
      clientId: "client-1",
      grantVersion: statements[3]?.values
        ? (statements[3].values as { version: string }).version
        : undefined,
    });
  });

  it("revokes tokens, consent, and the application grant in one batch", async () => {
    const { batch, db } = batchDb();
    const grant = {
      id: "grant-1",
      userId: "user-1",
      clientId: "client-1",
    } as typeof mcpOauthGrants.$inferSelect;

    await revokeMcpGrant(db, grant);

    expect(batch).toHaveBeenCalledOnce();
    const statements = batch.mock.calls[0]?.[0] as Statement[];
    expect(statements.map(({ operation, table }) => ({ operation, table }))).toEqual([
      { operation: "delete", table: oauthAccessToken },
      { operation: "delete", table: oauthRefreshToken },
      { operation: "delete", table: oauthConsent },
      { operation: "delete", table: mcpOauthAuthorizations },
      { operation: "update", table: mcpOauthGrants },
    ]);
    expect(statements[4]?.values).toMatchObject({
      revokedAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });
});
