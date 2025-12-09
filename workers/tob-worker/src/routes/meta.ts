import { Elysia } from 'elysia';
import { products, teams } from '@onfire/shared/drizzle/schema';
import { inArray } from 'drizzle-orm';
import { resolveContext } from '../core/context';
import type { Bindings, WorkerSingleton } from '../core/types';

export const createMetaRoutes = (env: Bindings) =>
  new Elysia<string, WorkerSingleton>({ prefix: '/meta' })
    .get('/teams', async ({ store, user }) => {
      const ctx = await resolveContext(env, user);
      const rows = await store.db.select().from(teams).where(inArray(teams.tenantId, ctx.tenantIds));
      return { data: rows };
    })
    .get('/products', async ({ store, user }) => {
      const ctx = await resolveContext(env, user);
      const rows = await store.db.select().from(products).where(inArray(products.tenantId, ctx.tenantIds));
      return { data: rows };
    });
