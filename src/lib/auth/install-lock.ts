import { and, eq, lte } from "drizzle-orm";
import { rateLimits } from "@/drizzle/schema";
import type { Database } from "@/lib/db";

const INSTALL_LOCK_KEY = "tob:install:lock";
const INSTALL_LOCK_TTL_MS = 5 * 60 * 1000;

/** Acquire the single-use installation lock, reclaiming it after a crash. */
export async function acquireInstallLock(db: Database): Promise<boolean> {
  const now = Date.now();
  await db
    .delete(rateLimits)
    .where(
      and(
        eq(rateLimits.key, INSTALL_LOCK_KEY),
        lte(rateLimits.resetAt, now)
      )
    );

  const rows = await db
    .insert(rateLimits)
    .values({
      key: INSTALL_LOCK_KEY,
      count: 1,
      resetAt: now + INSTALL_LOCK_TTL_MS,
    })
    .onConflictDoNothing()
    .returning({ key: rateLimits.key });

  return rows.length === 1;
}

export async function releaseInstallLock(db: Database): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, INSTALL_LOCK_KEY));
}
