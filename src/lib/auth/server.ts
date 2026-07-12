import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb, getEnv } from "@/lib/db";
import * as schema from "@/drizzle/schema";

export const getAuth = () => {
  const db = getDb();
  const env = getEnv();

  return betterAuth({
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
    plugins: [nextCookies()],
  });
};

export type Auth = ReturnType<typeof getAuth>;
