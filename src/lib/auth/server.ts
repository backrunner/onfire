import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb, getEnv } from "@/lib/db";
import * as schema from "@/drizzle/schema";

let authInstance: ReturnType<typeof betterAuth> | null = null;

export const getAuth = () => {
  if (authInstance) return authInstance;

  const db = getDb();
  const env = getEnv();

  authInstance = betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    secret: env.AUTH_SECRET,
    basePath: "/api/tob/auth",
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    plugins: [nextCookies()],
  });

  return authInstance;
};

export type Auth = ReturnType<typeof getAuth>;
