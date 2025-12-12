import { createDb } from '@onfire/shared/drizzle/client';
import { tenants, users } from '@onfire/shared/drizzle/schema';
import { sql } from 'drizzle-orm';
import type { D1Database } from '@cloudflare/workers-types';

export type InstallState = {
  hasUser: boolean;
  hasTenant: boolean;
};

export const readInstallState = async (db: ReturnType<typeof createDb>): Promise<InstallState> => {
  const userRow = await db.select({ count: sql<number>`count(*)` }).from(users).get();
  const tenantRow = await db.select({ count: sql<number>`count(*)` }).from(tenants).get();
  const userCount = Number((userRow as any)?.count ?? 0);
  const tenantCount = Number((tenantRow as any)?.count ?? 0);
  return { hasUser: userCount > 0, hasTenant: tenantCount > 0 };
};

export const assertInstalled = async (db: D1Database) => {
  const client = createDb(db);
  const state = await readInstallState(client);
  if (!state.hasUser) throw new Response('setup_required', { status: 428 });
  return state;
};




