import type { D1Database } from '@cloudflare/workers-types';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export const createDb = (db: D1Database) => drizzle(db, { schema });

export type Db = ReturnType<typeof createDb>;
export type Schema = typeof schema;
export * as tables from './schema';

