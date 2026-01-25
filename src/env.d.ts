import type { D1Database, R2Bucket, Service } from "@cloudflare/workers-types";

declare global {
  interface CloudflareEnv {
    // D1 Database
    DB: D1Database;
    // R2 Storage
    R2: R2Bucket;
    // Authentication
    AUTH_SECRET: string;
    // Turnstile
    TURNSTILE_SECRET: string;
    // JWT
    JWT_ISSUER: string;
    JWT_AUDIENCE: string;
    // Worker self reference
    WORKER_SELF_REFERENCE: Service;
  }
}

export {};
