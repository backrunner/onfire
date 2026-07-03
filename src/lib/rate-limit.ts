import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { rateLimits } from "@/drizzle/schema";
import type { Database } from "@/lib/db";
import { ApiError } from "@/lib/api/response";

export interface RateLimitOptions {
  /** Max requests per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets (only meaningful when denied). */
  retryAfter: number;
}

/**
 * Fixed-window rate limiter backed by D1. A single atomic upsert per check:
 * expired windows are reset in place, otherwise the counter increments.
 *
 * D1 writes serialize per database, which is exactly the consistency a
 * counter needs; the table is tiny (one row per active key) and rows are
 * reused, so no cleanup job is required.
 */
export async function checkRateLimit(
  db: Database,
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = options.windowSeconds * 1000;
  const newResetAt = now + windowMs;

  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, resetAt: newResetAt })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${rateLimits.resetAt} <= ${now} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        resetAt: sql`CASE WHEN ${rateLimits.resetAt} <= ${now} THEN ${newResetAt} ELSE ${rateLimits.resetAt} END`,
      },
    })
    .returning({ count: rateLimits.count, resetAt: rateLimits.resetAt });

  const allowed = row.count <= options.limit;
  return {
    allowed,
    remaining: Math.max(0, options.limit - row.count),
    retryAfter: Math.max(1, Math.ceil((row.resetAt - now) / 1000)),
  };
}

export function clientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/**
 * Enforce a rate limit for a request; throws ApiError(429) when exceeded.
 *
 * @param scope    logical bucket, e.g. "toc:create-ticket"
 * @param identity per-caller identifier (IP, customer id…)
 */
export async function enforceRateLimit(
  db: Database,
  request: NextRequest,
  scope: string,
  options: RateLimitOptions,
  identity?: string
): Promise<void> {
  const id = identity ?? clientIp(request);
  let result: RateLimitResult;
  try {
    result = await checkRateLimit(db, `${scope}:${id}`, options);
  } catch (error) {
    // Rate limiting must never take the endpoint down with it.
    console.error("Rate limit check failed:", error);
    return;
  }
  if (!result.allowed) {
    throw new ApiError(429, "Too many requests", {
      retryAfter: result.retryAfter,
    });
  }
}
