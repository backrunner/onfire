import { describe, expect, it, vi } from "vitest";
import type { DBAdapter, DBTransactionAdapter } from "better-auth";
import {
  wrapMcpOAuthAdapter,
  wrapMcpOAuthTransactionAdapter,
} from "./mcp-adapter";

function fakeAdapter(create = vi.fn()) {
  const adapter = {
    id: "fake",
    create,
    findOne: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    consumeOne: vi.fn(),
    incrementOne: vi.fn(),
    transaction: vi.fn(),
  } as unknown as DBAdapter;
  return { adapter, create };
}

describe("MCP OAuth Better Auth adapter", () => {
  it("clears browser session bindings on provider token creation", async () => {
    const { adapter, create } = fakeAdapter(
      vi.fn().mockResolvedValue({ id: "token-row" }),
    );
    const wrapped = wrapMcpOAuthAdapter(adapter);

    await wrapped.create({
      model: "oauthAccessToken",
      data: { sessionId: "browser-session", clientId: "client-1" },
    });
    await wrapped.create({
      model: "oauthRefreshToken",
      data: { sessionId: "browser-session", clientId: "client-1" },
    });

    expect(create).toHaveBeenNthCalledWith(1, {
      model: "oauthAccessToken",
      data: { sessionId: null, clientId: "client-1" },
    });
    expect(create).toHaveBeenNthCalledWith(2, {
      model: "oauthRefreshToken",
      data: { sessionId: null, clientId: "client-1" },
    });
  });

  it("leaves ordinary Better Auth rows unchanged", async () => {
    const { adapter, create } = fakeAdapter(
      vi.fn().mockResolvedValue({ id: "session-row" }),
    );
    const wrapped = wrapMcpOAuthAdapter(adapter);

    await wrapped.create({
      model: "session",
      data: { sessionId: "browser-session", userId: "user-1" },
    });

    expect(create).toHaveBeenCalledWith({
      model: "session",
      data: { sessionId: "browser-session", userId: "user-1" },
    });
  });

  it("also wraps token creation inside Better Auth transactions", async () => {
    const transactionCreate = vi
      .fn()
      .mockResolvedValue({ id: "token-row" });
    const transaction = fakeAdapter(transactionCreate).adapter as DBTransactionAdapter;
    const { adapter } = fakeAdapter();
    (adapter.transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (callback: (trx: DBTransactionAdapter) => Promise<unknown>) =>
        callback(transaction),
    );

    const wrapped = wrapMcpOAuthAdapter(adapter);
    await wrapped.transaction(async (trx) => {
      await trx.create({
        model: "oauthAccessToken",
        data: { sessionId: "browser-session" },
      });
    });

    expect(transactionCreate).toHaveBeenCalledWith({
      model: "oauthAccessToken",
      data: { sessionId: null },
    });
  });

  it("supports the transaction adapter helper directly", async () => {
    const { adapter, create } = fakeAdapter(
      vi.fn().mockResolvedValue({ id: "token-row" }),
    );

    await wrapMcpOAuthTransactionAdapter(adapter).create({
      model: "oauthRefreshToken",
      data: { sessionId: "browser-session" },
    });

    expect(create).toHaveBeenCalledWith({
      model: "oauthRefreshToken",
      data: { sessionId: null },
    });
  });
});
