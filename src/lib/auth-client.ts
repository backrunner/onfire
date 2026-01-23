"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "",
  basePath: "/api/tob/auth",
});

export const { signIn, signUp, signOut, useSession } = authClient;
