import { describe, it, expect, beforeAll } from "vitest";
import type { Database } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { createTestDb, uid } from "./test-db";

let db: Database;

beforeAll(async () => {
  db = await createTestDb();
});

describe("rate limiter", () => {
  it("allows up to the limit and then denies", async () => {
    const key = uid("rl");
    const opts = { limit: 3, windowSeconds: 60 };

    for (let i = 0; i < 3; i++) {
      const result = await checkRateLimit(db, key, opts);
      expect(result.allowed).toBe(true);
    }

    const denied = await checkRateLimit(db, key, opts);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfter).toBeGreaterThan(0);
    expect(denied.retryAfter).toBeLessThanOrEqual(60);
  });

  it("tracks separate keys independently", async () => {
    const opts = { limit: 1, windowSeconds: 60 };
    const a = uid("rl");
    const b = uid("rl");

    expect((await checkRateLimit(db, a, opts)).allowed).toBe(true);
    expect((await checkRateLimit(db, a, opts)).allowed).toBe(false);
    expect((await checkRateLimit(db, b, opts)).allowed).toBe(true);
  });

  it("resets the counter after the window expires", async () => {
    const key = uid("rl");
    // 0-second window: every check starts a fresh window
    const opts = { limit: 1, windowSeconds: 0 };

    expect((await checkRateLimit(db, key, opts)).allowed).toBe(true);
    expect((await checkRateLimit(db, key, opts)).allowed).toBe(true);
  });

  it("reports remaining quota", async () => {
    const key = uid("rl");
    const opts = { limit: 5, windowSeconds: 60 };

    const first = await checkRateLimit(db, key, opts);
    expect(first.remaining).toBe(4);
    const second = await checkRateLimit(db, key, opts);
    expect(second.remaining).toBe(3);
  });
});
