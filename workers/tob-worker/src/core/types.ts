import type { D1Database, R2Bucket, VectorizeIndex } from '@cloudflare/workers-types';
import type { Auth } from 'better-auth';
import type { Db } from '@onfire/shared/drizzle/client';

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

export type AppStore = {
  env: Bindings;
  db: Db;
  auth: Auth<any>;
};

export type AppContext = {
  store: AppStore;
  user?: AuthUser;
};

export type WorkerSingleton = {
  decorator: { user?: AuthUser };
  store: AppStore;
  derive: {};
  resolve: {};
};
