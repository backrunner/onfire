import { betterAuth } from 'better-auth';
import type { Bindings } from './types';

export const createAuthPlugin = (env: Bindings): { auth: ReturnType<typeof betterAuth> } => {
  const auth = betterAuth(
    {
      secret: env.AUTH_SECRET,
      emailAndPassword: { enabled: true },
      session: {
        sessionToken: { header: 'authorization', scheme: 'Bearer' }
      }
    } as any
  );

  return { auth };
};
