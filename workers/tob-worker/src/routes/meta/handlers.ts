import { products, teams } from '@onfire/shared/drizzle/schema';
import { inArray } from 'drizzle-orm';
import type { AppStore, AuthUser, Bindings } from '../../core/types';
import { resolveContext } from '../../core/context';

export const getTeams = async (env: Bindings, store: AppStore, user: AuthUser | undefined) => {
  const ctx = await resolveContext(env, user);
  const rows = await store.db.select().from(teams).where(inArray(teams.tenantId, ctx.tenantIds));
  return { data: rows };
};

export const getProducts = async (env: Bindings, store: AppStore, user: AuthUser | undefined) => {
  const ctx = await resolveContext(env, user);
  const rows = await store.db.select().from(products).where(inArray(products.tenantId, ctx.tenantIds));
  return { data: rows };
};
