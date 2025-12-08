import { jwtVerify, createRemoteJWKSet } from 'jose';
import type { Bindings } from './types';

export interface JwtIdentity {
  sub: string;
  email?: string;
  tenantId?: string;
  productId?: string;
  role?: string;
  teamIds?: string[];
}

export const verifyJwt = async (token: string, env: Bindings): Promise<JwtIdentity> => {
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
