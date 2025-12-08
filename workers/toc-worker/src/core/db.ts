import { schema, seedSql } from '@onfire/shared/schema';
import type { D1Database } from '@cloudflare/workers-types';

export const prepare = async (db: D1Database) => {
  for (const key of Object.keys(schema)) {
    // biome-ignore lint/style/noNonNullAssertion: dynamic access
    const sql = (schema as any)[key] as string;
    await db.exec(sql);
  }
  await db.exec(seedSql);
};
