import type { D1Database } from '@cloudflare/workers-types';

export interface Bindings {
  DB: D1Database;
  AUTH_SECRET: string;
  APP_PREFIX?: string;
  JWT_PUBLIC_KEY?: string;
  JWT_AUDIENCE?: string;
  JWT_ISSUER?: string;
  TURNSTILE_SECRET?: string;
}
