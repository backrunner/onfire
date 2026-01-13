/**
 * Router Factory
 * Provides a unified way to create Hono router instances with consistent settings
 */
import { Hono } from 'hono';
import type { Bindings, Variables } from './types';

export type AppRouter = Hono<{ Bindings: Bindings; Variables: Variables }>;

/**
 * Creates a new Hono router instance with consistent type parameters.
 * Use this instead of `new Hono()` directly in route modules.
 */
export const createRouter = (): AppRouter => new Hono<{ Bindings: Bindings; Variables: Variables }>();
