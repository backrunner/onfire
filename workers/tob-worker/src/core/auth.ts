import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { Bindings } from './types';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@onfire/shared/drizzle/schema';

export const createAuthPlugin = (env: Bindings, db: DrizzleD1Database<any>): { auth: ReturnType<typeof betterAuth> } => {
  const auth = betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification
      }
    }),
    secret: env.AUTH_SECRET,
    basePath: '/api/tob/auth',
    emailAndPassword: {
      enabled: true
    }
  });

  return { auth };
};
