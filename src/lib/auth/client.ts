"use client";

import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "",
  basePath: "/api/tob/auth",
  plugins: [twoFactorClient(), passkeyClient(), oauthProviderClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
