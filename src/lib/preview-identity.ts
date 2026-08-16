import { hmacSha256Hex, timingSafeEqual } from "@/lib/crypto";
import { canManageRole, canStartPreview } from "@/lib/api-utils";
import { forbidden } from "@/lib/api/response";
import { Role } from "@/lib/types";

export { canStartPreview };

export const PREVIEW_COOKIE_NAME = "onfire-preview";
export const PREVIEW_TTL_SECONDS = 60 * 60;
export const PREVIEW_READONLY_CODE = "preview_readonly";
export const PREVIEW_READONLY_MESSAGE = "Preview identity cannot change data";

export interface PreviewCookiePayload {
  actorId: string;
  targetUserId: string;
  exp: number;
}

export interface PreviewActor {
  isSuperAdmin: boolean;
  role: Role;
  user: { id: string };
  tenantIds: string[];
}

export interface PreviewTarget {
  id: string;
  role: Role;
  tenantId: string;
}

export function assertCanPreview(actor: PreviewActor, target: PreviewTarget): void {
  if (!canStartPreview(actor.role)) {
    throw forbidden("Preview identity is SuperAdmin or TenantAdmin only");
  }
  if (actor.user.id === target.id) {
    throw forbidden("Cannot preview your own identity");
  }
  if (!canManageRole(actor.role, target.role)) {
    throw forbidden("Cannot preview an equal or higher role");
  }
  if (!actor.isSuperAdmin && !actor.tenantIds.includes(target.tenantId)) {
    throw forbidden("Preview target is outside your tenant");
  }
}

export function isPreviewControlPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === "/api/tob/preview";
}

export function isWriteMethod(method: string): boolean {
  return (
    method === "POST" ||
    method === "PATCH" ||
    method === "PUT" ||
    method === "DELETE"
  );
}

export function previewCookieOptions(maxAge: number, secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    secure,
  };
}

export async function sealPreviewCookie(
  payload: PreviewCookiePayload,
  secret: string
): Promise<string> {
  const body = JSON.stringify({
    a: payload.actorId,
    t: payload.targetUserId,
    e: payload.exp,
  });
  const encoded = base64UrlEncode(body);
  const signature = await hmacSha256Hex(`v1.${encoded}`, secret);
  return `v1.${encoded}.${signature}`;
}

export async function verifyPreviewCookie(
  value: string | undefined,
  secret: string,
  now = Date.now()
): Promise<PreviewCookiePayload | null> {
  if (!value || !secret) return null;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const [, encoded, signature] = parts;
  if (!encoded || !signature) return null;
  const expected = await hmacSha256Hex(`v1.${encoded}`, secret);
  if (!(await timingSafeEqual(signature, expected))) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(encoded)) as {
      a?: unknown;
      t?: unknown;
      e?: unknown;
    };
    if (
      typeof parsed.a !== "string" ||
      typeof parsed.t !== "string" ||
      typeof parsed.e !== "number"
    ) {
      return null;
    }
    if (parsed.e * 1000 <= now) return null;
    return { actorId: parsed.a, targetUserId: parsed.t, exp: parsed.e };
  } catch {
    return null;
  }
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(value: string): string {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
