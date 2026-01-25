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
    basePath: "/api/tob/auth",
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    plugins: [nextCookies()],
  });
};

export type Auth = ReturnType<typeof getAuth>;
