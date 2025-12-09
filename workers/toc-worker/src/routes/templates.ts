import { Elysia } from 'elysia';
import { templates } from '@onfire/shared/drizzle/schema';
import { eq } from 'drizzle-orm';
import { verifyJwt } from '../core/jwt';
import type { Bindings } from '../core/types';

export const createTemplateRoutes = (env: Bindings) =>
  new Elysia().get('/templates', async ({ query, request, store }) => {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return new Response('missing token', { status: 401 });
    const identity = await verifyJwt(token, env, store.db); // 验证身份后再返回模板
    const productId = (query['productId'] as string | undefined) ?? identity.productId;
    const rows = productId
      ? await store.db.select().from(templates).where(eq(templates.productId, productId))
      : await store.db.select().from(templates);
    return rows;
  });
