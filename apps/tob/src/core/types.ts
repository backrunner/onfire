import type { D1Database, R2Bucket, VectorizeIndex } from '@cloudflare/workers-types';
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
  AUTO_CLOSE_REPLY_HOURS?: string;
  ASSETS?: Fetcher;
  // AI Feature Bindings
  KNOWLEDGE_BUCKET?: R2Bucket;
  VECTORIZE_INDEX?: VectorizeIndex;
  AI_ENCRYPTION_KEY?: string; // For encrypting stored API keys
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
