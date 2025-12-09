import type { D1Database } from '@cloudflare/workers-types';
import { migrate } from 'drizzle-orm/d1/migrator';
import { createDb } from '@onfire/shared/drizzle/client';

export const prepare = async (db: D1Database) => {
  const client = createDb(db);
  try {
    const migrationsPath = new URL('../../../../drizzle/migrations', import.meta.url).pathname;
    await migrate(client, { migrationsFolder: migrationsPath });
  } catch (err) {
    console.warn('drizzle migration skipped or failed', err);
  }
};
