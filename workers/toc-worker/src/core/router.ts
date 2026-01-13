/**
 * Router Factory
 * Provides a unified way to create Elysia router instances with consistent settings
 */
import { Elysia } from 'elysia';
import type { WorkerSingleton } from './types';

export interface RouterOptions {
  prefix?: string;
  name?: string;
}

/**
 * Creates a new Elysia router instance with consistent type parameters and settings.
 * Use this instead of `new Elysia()` directly in route modules.
 */
export const createRouter = (options?: RouterOptions) =>
  new Elysia<string, WorkerSingleton>({
    ...options,
    aot: false,
  });
