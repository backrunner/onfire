import type { D1Database } from '@cloudflare/workers-types';
import { createDb } from '@onfire/shared/drizzle/client';

// Migrations are handled by wrangler CLI: npm run db:migrate:tob
// Runtime migrations not supported in Workers (no filesystem access)
export const prepare = async (_db: D1Database) => {
  // No-op: migrations handled externally via wrangler d1 migrations apply
};
