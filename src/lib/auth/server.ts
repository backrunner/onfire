import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { oauthProvider } from "@better-auth/oauth-provider";
import { getDb, getEnv } from "@/lib/db";
import { getPasskeyRelyingParty } from "@/lib/auth/passkey-config";
import { wrapMcpOAuthAdapter } from "@/lib/auth/mcp-adapter";
import {
  MCP_ACCESS_TOKEN_PREFIX,
  MCP_OAUTH_SCOPE,
  MCP_REFRESH_TOKEN_PREFIX,
  getMcpResourceUrl,
} from "@/lib/mcp/oauth";
import * as schema from "@/drizzle/schema";

export const getAuth = () => {
  const db = getDb();
  const env = getEnv();

  return betterAuth({
    database: (options: BetterAuthOptions) =>
      wrapMcpOAuthAdapter(
        drizzleAdapter(db, {
          provider: "sqlite",
          schema: {
            user: schema.user,
            session: schema.session,
            account: schema.account,
            verification: schema.verification,
            twoFactor: schema.twoFactor,
            passkey: schema.passkey,
            oauthClient: schema.oauthClient,
            oauthResource: schema.oauthResource,
            oauthClientResource: schema.oauthClientResource,
            oauthRefreshToken: schema.oauthRefreshToken,
            oauthAccessToken: schema.oauthAccessToken,
            oauthConsent: schema.oauthConsent,
            oauthClientAssertion: schema.oauthClientAssertion,
          },
        })(options),
      ),
    secret: env.AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/tob/auth",
    advanced: {
      ipAddress: {
        // Cloudflare overwrites this single-value header at the public edge.
        // Do not trust client-controlled forwarding headers for auth rate limits.
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // Accounts are provisioned by installation or an authorized manager.
      // Do not create a session for the newly provisioned user.
      autoSignIn: false,
    },
    plugins: [
      twoFactor({
        issuer: "OnFire",
        accountLockout: {
          enabled: true,
          maxFailedAttempts: 10,
          durationSeconds: 15 * 60,
        },
      }),
      passkey(getPasskeyRelyingParty(env.BETTER_AUTH_URL)),
      oauthProvider({
        loginPage: "/admin/login",
        consentPage: "/admin/oauth/authorize",
        scopes: [MCP_OAUTH_SCOPE, "offline_access"],
        advertisedMetadata: {
          scopes_supported: [MCP_OAUTH_SCOPE, "offline_access"],
        },
        resources: [
          {
            identifier: getMcpResourceUrl(),
            name: "OnFire MCP",
            allowedScopes: [MCP_OAUTH_SCOPE, "offline_access"],
          },
        ],
        enforcePerClientResources: true,
        clientRegistrationDefaultResources: [getMcpResourceUrl()],
        clientRegistrationAllowedResources: [getMcpResourceUrl()],
        grantTypes: ["authorization_code", "refresh_token"],
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultScopes: [MCP_OAUTH_SCOPE],
        clientRegistrationAllowedScopes: [MCP_OAUTH_SCOPE, "offline_access"],
        disableJwtPlugin: true,
        storeTokens: "hashed",
        refreshTokenReuseInterval: 0,
        prefix: {
          opaqueAccessToken: MCP_ACCESS_TOKEN_PREFIX,
          refreshToken: MCP_REFRESH_TOKEN_PREFIX,
        },
        clientPrivileges: () => false,
        silenceWarnings: { oauthAuthServerConfig: true },
      }),
      nextCookies(),
    ],
  });
};

export type Auth = ReturnType<typeof getAuth>;
