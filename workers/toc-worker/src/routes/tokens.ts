import { Elysia } from 'elysia';
import { SignJWT } from 'jose';
import { eq } from 'drizzle-orm';
import { productKeys, products } from '@onfire/shared/drizzle/schema';
import type { Bindings, WorkerSingleton } from '../core/types';

type IssueBody = {
  email?: string;
  externalId?: string;
  level?: number;
  meta?: Record<string, unknown>;
};

const parseApiKey = (headers: Headers, body?: IssueBody & { apiKey?: string }) => {
  const header = headers.get('x-api-key') ?? headers.get('authorization')?.replace(/Bearer\s+/i, '');
  return header ?? body?.apiKey;
};

const generateToken = async (secret: string, kid: string, issuer: string | undefined, audience: string | undefined, payload: Record<string, any>) => {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', kid })
    .setIssuedAt()
    .setExpirationTime('1h')
    .setIssuer(issuer ?? 'onfire-toc')
    .setAudience(audience ?? 'toc')
    .sign(new TextEncoder().encode(secret));
};

export const createTokenRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>({ prefix: '/tokens' }).post('/issue', async ({ request, store }) => {
    const body = (await request.json().catch(() => ({}))) as IssueBody & { apiKey?: string };
    const apiKey = parseApiKey(request.headers, body);
    if (!apiKey) return new Response('missing api key', { status: 401 });
    const [keyId, rawSecret] = apiKey.includes('.') ? apiKey.split('.', 2) : [undefined, undefined];
    if (!keyId || !rawSecret) return new Response('invalid api key format', { status: 401 });

    const keyRow = await store.db.query.productKeys.findFirst({ where: eq(productKeys.id, keyId) });
    if (!keyRow || keyRow.revoked) return new Response('forbidden', { status: 403 });
    if (keyRow.secret !== rawSecret) return new Response('forbidden', { status: 403 });

    const product = await store.db.query.products.findFirst({ where: eq(products.id, keyRow.productId) });
    if (!product) return new Response('product not found', { status: 404 });

    const token = await generateToken(rawSecret, keyRow.id, env.JWT_ISSUER, env.JWT_AUDIENCE, {
      sub: body.externalId ?? body.email ?? 'customer',
      email: body.email,
      externalId: body.externalId,
      productId: keyRow.productId,
      tenantId: product.tenantId,
      level: body.level,
      meta: body.meta
    });

    await store.db.update(productKeys).set({ lastUsedAt: new Date().toISOString() }).where(eq(productKeys.id, keyRow.id)).run();
    return { token, productId: keyRow.productId, tenantId: product.tenantId };
  });
