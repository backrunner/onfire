import { betterAuth } from 'better-auth';
import { Elysia as ElysiaFactory } from 'elysia';
import type { Elysia } from 'elysia';
import type { Bindings, WorkerSingleton } from './types';

export const createAuthPlugin = (env: Bindings): { plugin: Elysia<string, WorkerSingleton>; auth: ReturnType<typeof betterAuth> } => {
  const auth = betterAuth(
    {
      secret: env.AUTH_SECRET,
      emailAndPassword: { enabled: true },
      session: {
        sessionToken: { header: 'authorization', scheme: 'Bearer' }
      }
    } as any
  );

  const resolveSession = async (headers: Headers) => {
    const cloned = new Headers(headers);
    const authHeader = headers.get('authorization');
    if (authHeader && !cloned.get('Authorization')) cloned.set('Authorization', authHeader);
    return auth.api.getSession({ headers: cloned });
  };

  const plugin = new ElysiaFactory<string, WorkerSingleton>({ name: 'better-auth' })
    .mount(auth.handler)
    .macro({
      auth: {
        async resolve({ request: { headers } }) {
          const session = await resolveSession(headers);
          if (!session) throw new Response('unauthorized', { status: 401 });
          return { user: session.user, session: session.session } as const;
        }
      }
    });

  return { plugin: plugin as unknown as Elysia<string, WorkerSingleton>, auth };
};
