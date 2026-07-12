import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { getEnv } from "@/lib/db";

/**
 * Minimal routing claims carried by a ToC customer token. Mutable customer
 * profile fields are intentionally hydrated from D1 by withCustomerAuth.
 */
export interface CustomerTokenPayload {
  /** Customer ID (customers.id) */
  sub: string;
  productId: string;
  tenantId: string;
}

const TOKEN_TTL_SECONDS = 24 * 60 * 60;

const encoder = new TextEncoder();

function getSecretKey(): Uint8Array {
  const env = getEnv();
  const secret = env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured");
  }
  // Domain-separate the ToC signing key from Better Auth's usage of AUTH_SECRET.
  return encoder.encode(`toc:${secret}`);
}

function getIssuerAudience() {
  const env = getEnv();
  return {
    issuer: env.JWT_ISSUER || "onfire",
    audience: env.JWT_AUDIENCE || "onfire-toc",
  };
}

export async function signCustomerToken(
  payload: CustomerTokenPayload
): Promise<{ token: string; expiresIn: number }> {
  const { issuer, audience } = getIssuerAudience();
  const token = await new SignJWT({
    productId: payload.productId,
    tenantId: payload.tenantId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(getSecretKey());

  return { token, expiresIn: TOKEN_TTL_SECONDS };
}

export async function verifyCustomerToken(
  token: string
): Promise<CustomerTokenPayload | null> {
  const { issuer, audience } = getIssuerAudience();
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
      issuer,
      audience,
    });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.productId !== "string" ||
      typeof payload.tenantId !== "string"
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      productId: payload.productId,
      tenantId: payload.tenantId,
    };
  } catch {
    return null;
  }
}

export function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

export async function authenticateCustomer(
  request: NextRequest
): Promise<CustomerTokenPayload | null> {
  const token = getBearerToken(request);
  if (!token) return null;
  return verifyCustomerToken(token);
}
