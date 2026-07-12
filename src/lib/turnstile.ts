import { getEnv } from "@/lib/db";
import { readResponseJson } from "@/lib/response-body";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileResult {
  success: boolean;
  errorCodes?: string[];
}

/**
 * Verify a Cloudflare Turnstile token server-side.
 *
 * When TURNSTILE_SECRET is not configured the check is skipped (returns
 * success) so self-hosted deployments can opt out of CAPTCHA; configure the
 * secret to enforce it on all public ToC write endpoints.
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string | null
): Promise<TurnstileResult> {
  const env = getEnv();
  const secret = env.TURNSTILE_SECRET;
  if (!secret) {
    return { success: true };
  }
  if (!token) {
    return { success: false, errorCodes: ["missing-input-response"] };
  }

  try {
    const form = new FormData();
    form.set("secret", secret);
    form.set("response", token);
    if (remoteIp) form.set("remoteip", remoteIp);

    const res = await fetchWithTimeout(VERIFY_URL, { method: "POST", body: form }, 5_000);
    if (!res.ok) {
      return { success: false, errorCodes: [`http-${res.status}`] };
    }
    const data = await readResponseJson<{
      success: boolean;
      "error-codes"?: string[];
    }>(res);
    return { success: data.success, errorCodes: data["error-codes"] };
  } catch {
    // Network failure verifying CAPTCHA: fail closed for write protection.
    return { success: false, errorCodes: ["verification-unavailable"] };
  }
}

export function isTurnstileEnabled(): boolean {
  return Boolean(getEnv().TURNSTILE_SECRET);
}
