import { NextRequest } from "next/server";
import { and, like, lte } from "drizzle-orm";
import { rateLimits } from "@/drizzle/schema";
import { getDb, getEnv, type Database } from "@/lib/db";
import { ApiError } from "@/lib/api/response";
import { hmacSha256Hex } from "@/lib/crypto";
import { withNoStore } from "@/lib/http-cache";
import { enforceStrictRateLimit } from "@/lib/rate-limit";
import { readBodyBytes } from "@/lib/request-body";

const PREFIX = "tob:login:";
const WINDOW_SECONDS = 15 * 60;

/** Count before password hashing / challenge verification, across Worker instances. */
export async function protectLoginRequest(
  request: NextRequest,
): Promise<NextRequest | Response> {
  const pathname = new URL(request.url).pathname;
  // Reject aliases instead of letting the router and limiter interpret them differently.
  if (pathname.includes("%") || pathname.includes("//") || pathname.includes("\\")) {
    return loginError(400, "INVALID_AUTH_PATH", "Invalid authentication path");
  }
  const path = pathname.replace(/\/+$/, "").slice("/api/tob/auth".length);
  const protectedPath = path.startsWith("/sign-in/") ||
    path.startsWith("/two-factor/") || path.startsWith("/passkey/") ||
    path === "/change-password" || path === "/reset-password" ||
    path === "/request-password-reset";
  // Listing credentials is authenticated and contains no verification attempt.
  if (!protectedPath || path === "/passkey/list-user-passkeys") return request;

  try {
    const db = getDb();
    await enforceStrictRateLimit(db, request, `${PREFIX}ip:minute`, {
      limit: 30, windowSeconds: 60,
    });
    await enforceStrictRateLimit(db, request, `${PREFIX}ip:window`, {
      limit: 100, windowSeconds: WINDOW_SECONDS,
    });

    if (request.method !== "POST") return request;
    // Read the original bounded stream (not a tee that buffers an unlimited copy).
    const bytes = await readBodyBytes(request, 16 * 1024);
    if (path === "/sign-in/email") {
      const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
      if (mediaType !== "application/json") {
        return loginError(415, "INVALID_CONTENT_TYPE", "JSON request body required");
      }
      let body: unknown;
      try {
        body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      } catch {
        return loginError(400, "INVALID_BODY", "Invalid login request");
      }
      if (!body || typeof body !== "object" || !("email" in body) ||
        typeof body.email !== "string" || !body.email.trim() || body.email.length > 320) {
        return loginError(400, "INVALID_BODY", "Invalid login request");
      }
      const secret = getEnv().AUTH_SECRET;
      if (!secret) throw new Error("Missing authentication secret");
      // Same bucket regardless of case, IP, or account existence; no raw email in D1.
      const identity = await hmacSha256Hex(body.email.trim().toLowerCase(), secret);
      await enforceStrictRateLimit(db, request, `${PREFIX}account`, {
        limit: 10, windowSeconds: WINDOW_SECONDS,
      }, identity);
    }
    return new NextRequest(request.url, {
      method: request.method,
      headers: request.headers,
      body: bytes,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      const retryAfter = (error.details as { retryAfter?: number } | undefined)?.retryAfter;
      return loginError(error.status,
        error.status === 429 ? "TOO_MANY_REQUESTS" : "AUTH_REQUEST_REJECTED",
        error.message, retryAfter);
    }
    console.error("Login protection unavailable");
    return loginError(503, "AUTH_UNAVAILABLE", "Authentication temporarily unavailable");
  }
}

function loginError(status: number, code: string, message: string, retryAfter?: number): Response {
  return withNoStore(Response.json({ code, message }, {
    status,
    headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
  }));
}

/** Random email/IP attempts must not leave permanent counter rows behind. */
export async function purgeExpiredLoginLimits(db: Database): Promise<void> {
  await db.delete(rateLimits).where(and(
    like(rateLimits.key, `${PREFIX}%`),
    lte(rateLimits.resetAt, Date.now()),
  ));
}
