import { SignJWT } from 'jose';
import { eq } from 'drizzle-orm';
import { productKeys, products } from '@onfire/shared/drizzle/schema';
import { createRouter } from '../../core/router';

type IssueBody = {
  email?: string;
  externalId?: string;
  level?: number;
  meta?: Record<string, unknown>;
  apiKey?: string;
};

const parseApiKey = (headers: Headers, body?: IssueBody) => {
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

export const authRoutes = () => {
  const router = createRouter();

  router.post('/tokens/issue', async (c) => {
    const body = await c.req.json().catch(() => ({})) as IssueBody;
    const apiKey = parseApiKey(c.req.raw.headers, body);
    if (!apiKey) return c.json({ error: 'missing api key' }, 401);
    const [keyId, rawSecret] = apiKey.includes('.') ? apiKey.split('.', 2) : [undefined, undefined];
    if (!keyId || !rawSecret) return c.json({ error: 'invalid api key format' }, 401);

    const db = c.get('db');
    const keyRow = await db.query.productKeys.findFirst({ where: eq(productKeys.id, keyId) });
    if (!keyRow || keyRow.revoked) return c.json({ error: 'forbidden' }, 403);
    if (keyRow.secret !== rawSecret) return c.json({ error: 'forbidden' }, 403);

    const product = await db.query.products.findFirst({ where: eq(products.id, keyRow.productId) });
    if (!product) return c.json({ error: 'product not found' }, 404);

    const token = await generateToken(rawSecret, keyRow.id, c.env.JWT_ISSUER, c.env.JWT_AUDIENCE, {
      sub: body.externalId ?? body.email ?? 'customer',
      email: body.email,
      externalId: body.externalId,
      productId: keyRow.productId,
      tenantId: product.tenantId,
      level: body.level,
      meta: body.meta
    });

    await db.update(productKeys).set({ lastUsedAt: new Date().toISOString() }).where(eq(productKeys.id, keyRow.id)).run();
    return c.json({ token, productId: keyRow.productId, tenantId: product.tenantId });
  });

  return router;
};
