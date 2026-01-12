import { verifyJwt } from '../../core/jwt';
import type { Bindings } from '../../core/types';

export const health = () => ({ ok: true, ts: Date.now() });

export const whoami = async (request: Request, env: Bindings) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return new Response('missing token', { status: 401 });
  const identity = await verifyJwt(token, env);
  return { identity };
};
