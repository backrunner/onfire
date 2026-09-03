import { NextResponse } from "next/server";

export interface ApiOk<T> {
  ok: true;
  data: T;
}

export interface ApiErr {
  ok: false;
  error: string;
  details?: unknown;
}

export const ok = <T>(data: T, status = 200): NextResponse =>
  NextResponse.json({ ok: true, data } satisfies ApiOk<T>, { status });

export const err = (
  error: string,
  status = 400,
  details?: unknown
): NextResponse =>
  NextResponse.json(
    { ok: false, error, ...(details !== undefined ? { details } : {}) } satisfies ApiErr,
    { status }
  );

/**
 * Throwable error that `withAuth` / `withCustomerAuth` translate into an
 * error response, so deeply nested helpers can abort a request cleanly.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const unauthorized = () => new ApiError(401, "Unauthorized");
export const forbidden = (message = "Forbidden") => new ApiError(403, message);
export const notFound = (message = "Not found") => new ApiError(404, message);
export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, message, details);
export const conflict = (message: string, details?: unknown) =>
  new ApiError(409, message, details);
