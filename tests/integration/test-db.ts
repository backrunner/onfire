import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/drizzle/schema";
import type { Database } from "@/lib/db";

const MIGRATIONS_DIR = join(__dirname, "../../drizzle/migrations");

/**
 * In-memory SQLite database with the real migration files applied.
 *
 * The drizzle/libsql instance is API-compatible with the D1 instance for
 * everything the services use (select/insert/update/delete/query/batch),
 * so it is cast to the production `Database` type.
 */
export async function createTestDb(): Promise<Database> {
  const client = createClient({ url: ":memory:" });

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const content = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    for (const statement of content.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (!trimmed) continue;
      await client.execute(trimmed);
    }
  }

  return drizzle(client, { schema }) as unknown as Database;
}

let counter = 0;
/** Unique suffix so tests never collide on IDs or cached team lookups. */
export function uid(prefix: string): string {
  return `${prefix}-${++counter}-${Math.random().toString(36).slice(2, 8)}`;
}

export const NOW = () => new Date().toISOString();

export const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString();

export const minutesFromNow = (m: number) =>
  new Date(Date.now() + m * 60_000).toISOString();
