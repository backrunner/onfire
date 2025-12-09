import { jwtVerify, createRemoteJWKSet, decodeProtectedHeader } from 'jose';
import { eq } from 'drizzle-orm';
import type { Bindings } from './types';
import type { Db } from '@onfire/shared/drizzle/client';
import { productKeys } from '@onfire/shared/drizzle/schema';

export interface JwtIdentity {
  sub: string;
  email?: string;
  tenantId?: string;
  productId?: string;
  role?: string;
  teamIds?: string[];
  externalId?: string;
  level?: number;
  meta?: Record<string, unknown>;
}

const text = (v: unknown) => (typeof v === 'string' ? v : undefined);

export const verifyJwt = async (token: string, env: Bindings, db?: Db): Promise<JwtIdentity> => {
  const headerKid = (() => {
    try {
      return decodeProtectedHeader(token)?.kid;
    } catch {
      return undefined;
    }
  })();

  // 优先使用产品 API Key 签发的 HS256 Token
  if (db && headerKid) {
    const keyRow = await db.query.productKeys.findFirst({ where: eq(productKeys.id, headerKid) });
    if (keyRow && !keyRow.revoked) {
      const secret = new TextEncoder().encode(keyRow.secret);
      const { payload } = await jwtVerify(token, secret, {
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE
      });
      if (keyRow.id) {
        await db.update(productKeys).set({ lastUsedAt: new Date().toISOString() }).where(eq(productKeys.id, keyRow.id)).run();
      }
      return {
        sub: String(payload.sub ?? payload.externalId ?? payload.email ?? ''),
        email: text(payload.email),
        externalId: text((payload as any).externalId),
        tenantId: text((payload as any).tenantId),
        productId: text((payload as any).productId) ?? keyRow.productId,
        role: text((payload as any).role),
        teamIds: ((payload as any).teamIds as string[] | undefined) ?? [],
        level: typeof (payload as any).level === 'number' ? ((payload as any).level as number) : undefined,
        meta: (payload as any).meta as Record<string, unknown> | undefined
      };
    }
  }

  // 回退到远端 JWK（兼容旧链路）
  if (!env.JWT_PUBLIC_KEY) throw new Error('missing JWT_PUBLIC_KEY');
  const jwks = createRemoteJWKSet(new URL(env.JWT_PUBLIC_KEY));
  const { payload } = await jwtVerify(token, jwks, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE
  });
  return {
    sub: String(payload.sub),
    email: payload.email as string | undefined,
    tenantId: payload['tenantId'] as string | undefined,
    productId: payload['productId'] as string | undefined,
    role: payload['role'] as string | undefined,
    teamIds: (payload['teamIds'] as string[] | undefined) ?? []
  };
};
