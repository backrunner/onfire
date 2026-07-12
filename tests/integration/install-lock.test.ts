import { beforeEach, describe, expect, it } from "vitest";
import { rateLimits } from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import {
  acquireInstallLock,
  releaseInstallLock,
} from "@/lib/auth/install-lock";
import { createTestDb } from "./test-db";

const INSTALL_LOCK_KEY = "tob:install:lock";

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
});

describe("installation lock", () => {
  it("allows only one holder until the lock is released", async () => {
    expect(await acquireInstallLock(db)).toBe(true);
    expect(await acquireInstallLock(db)).toBe(false);

    await releaseInstallLock(db);
    expect(await acquireInstallLock(db)).toBe(true);
  });

  it("reclaims an expired lock after an interrupted installation", async () => {
    await db.insert(rateLimits).values({
      key: INSTALL_LOCK_KEY,
      count: 1,
      resetAt: Date.now() - 1,
    });

    expect(await acquireInstallLock(db)).toBe(true);
  });
});
