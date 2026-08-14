import { forbidden } from "@/lib/api/response";
import { getEnv } from "@/lib/db";

/** Require a browser mutation to originate from the canonical ToB origin. */
export function assertCanonicalTobOrigin(
  request: Request,
  action: string,
): void {
  const origin = request.headers.get("origin");
  let parsed: URL;
  try {
    parsed = new URL(origin ?? "");
  } catch {
    throw forbidden(`A canonical ${action} origin is required`);
  }
  if (origin !== parsed.origin) {
    throw forbidden(`A canonical ${action} origin is required`);
  }
  if (parsed.origin !== new URL(getEnv().BETTER_AUTH_URL).origin) {
    throw forbidden(`Cross-origin ${action} is not allowed`);
  }
}
