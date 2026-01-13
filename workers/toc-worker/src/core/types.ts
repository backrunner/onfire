import type { D1Database } from '@cloudflare/workers-types';
import type { Auth } from 'better-auth';
import type { Db } from '@onfire/shared/drizzle/client';
import type { Context } from 'hono';

export interface Bindings {
  DB: D1Database;
  AUTH_SECRET: string;
  APP_PREFIX?: string;
  JWT_PUBLIC_KEY?: string;
  JWT_AUDIENCE?: string;
  JWT_ISSUER?: string;
  TURNSTILE_SECRET?: string;
  TASK_SECRET?: string;
  ASSETS?: Fetcher;
}

export interface AuthUser {
  id?: string;
  email?: string;
  role?: string;
}

export interface Variables {
  db: Db;
  auth: Auth<any>;
  user?: AuthUser;
}

export type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;
