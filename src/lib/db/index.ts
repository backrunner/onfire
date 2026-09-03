import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import { cache } from "react";
import * as schema from "@/drizzle/schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Get database instance synchronously (for use in route handlers)
 * Must be called within a request context
 */
export const getDb = cache(() => {
  const { env } = getCloudflareContext();
  return drizzle(env.DB, { schema });
});

/**
 * Get Cloudflare environment bindings
 */
export const getEnv = cache(() => {
  const { env } = getCloudflareContext();
  return env;
});
