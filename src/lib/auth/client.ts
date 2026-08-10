"use client";

import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "",
  basePath: "/api/tob/auth",
  plugins: [twoFactorClient(), passkeyClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
