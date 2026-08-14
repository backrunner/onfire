import type {
  DBAdapter,
  DBTransactionAdapter,
} from "better-auth";

const MCP_OAUTH_TOKEN_MODELS = new Set([
  "oauthAccessToken",
  "oauthRefreshToken",
]);

type AdapterCreate = DBAdapter["create"];

/**
 * MCP OAuth is a delegated application session, not a browser session. Keep
 * Better Auth's provider-created token rows independent of the interactive
 * session so the provider's session-delete hook cannot revoke them on logout.
 */
function wrapTokenCreate<T extends { create: AdapterCreate }>(adapter: T): T {
  const create = async <Data extends Record<string, any>, Result = Data>(
    input: {
      model: string;
      data: Omit<Data, "id">;
      select?: string[];
      forceAllowId?: boolean;
    },
  ): Promise<Result> => {
    const data = MCP_OAUTH_TOKEN_MODELS.has(input.model)
      ? { ...input.data, sessionId: null }
      : input.data;

    return adapter.create<Data, Result>({
      ...input,
      data,
    });
  };

  return { ...adapter, create } as T;
}

export function wrapMcpOAuthTransactionAdapter(
  adapter: DBTransactionAdapter,
): DBTransactionAdapter {
  return wrapTokenCreate(adapter);
}

export function wrapMcpOAuthAdapter(adapter: DBAdapter): DBAdapter {
  const wrapped = wrapTokenCreate(adapter);
  return {
    ...wrapped,
    transaction: (callback) =>
      adapter.transaction((transaction) =>
        callback(wrapMcpOAuthTransactionAdapter(transaction)),
      ),
  };
}
