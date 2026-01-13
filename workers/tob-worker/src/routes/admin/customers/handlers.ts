import { assertPermission } from '@onfire/shared/rbac';
import { customers, type CustomerRow } from '@onfire/shared/drizzle/schema';
import { and, eq, gte, lte, inArray } from 'drizzle-orm';
import { resolveContext } from '../../../core/context';
import type { AppStore, AuthUser, Bindings } from '../../../core/types';
import { parseJsonSafe } from '../utils';

type CustomerQuery = Record<string, string | undefined>;

export const listCustomers = async (env: Bindings, store: AppStore, user: AuthUser | undefined, query: CustomerQuery) => {
  const ctx = await resolveContext(env, user);
  assertPermission(ctx, 'customer.read');
  const email = (query['email'] as string | undefined) ?? undefined;
  const productId = (query['productId'] as string | undefined) ?? undefined;
  const tenantId = (query['tenantId'] as string | undefined) ?? undefined;
  const levelMin = query['levelMin'] ? Number(query['levelMin']) : undefined;
  const levelMax = query['levelMax'] ? Number(query['levelMax']) : undefined;

  const where = [inArray(customers.tenantId, tenantId ? [tenantId] : ctx.tenantIds)];
  if (email) where.push(eq(customers.email, email));
  if (productId) where.push(eq(customers.productId, productId));
  if (typeof levelMin === 'number' && Number.isFinite(levelMin)) where.push(gte(customers.level, levelMin));
  if (typeof levelMax === 'number' && Number.isFinite(levelMax)) where.push(lte(customers.level, levelMax));

  const rows = await store.db.select().from(customers).where(and(...where));
  const data = rows.map((c: CustomerRow) => ({
    ...c,
    meta: parseJsonSafe(c.meta)
  }));
  return { data };
};
