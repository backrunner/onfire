import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { readResponseText } from "@/lib/response-body";
import type { SendResult } from "./index";

export async function postWebhookJson(
  url: string,
  payload: unknown
): Promise<{ response: Response; text: string }> {
  const response = await fetchWithTimeout(url, {
    method: "POST",
    redirect: "error",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { response, text: await readResponseText(response) };
}

export function webhookFailure(response: Response, text: string): SendResult {
  return {
    success: false,
    error: text.slice(0, 2_000) || `HTTP ${response.status}`,
  };
}

export function messageText(title: string, body: string, url?: string): string {
  return `${title}\n\n${body}${url ? `\n\n${url}` : ""}`;
}

export async function hmacSha256Base64(
  key: string,
  message: string
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(message)
  );
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
