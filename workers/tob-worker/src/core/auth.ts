import { betterAuth } from 'better-auth';
import type { Bindings } from './types';

export const createAuthPlugin = (env: Bindings): { auth: ReturnType<typeof betterAuth> } => {
  const auth = betterAuth(
    {
      secret: env.AUTH_SECRET,
      emailAndPassword: { enabled: true },
      session: {
        // 允许前端通过 Authorization: Bearer <token> 发送会话
        sessionToken: { header: 'authorization', scheme: 'Bearer' }
      }
    } as any
  );

  return { auth };
};
