/**
 * Route Utilities
 * Shared helpers for route handlers
 */
import type { Context } from 'hono';
import type { Bindings, Variables } from './types';

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * Handle route result and return appropriate response
 */
export const handleResult = (c: AppContext, result: unknown) => {
  if (result instanceof Response) {
    return result;
  }
  if (result && typeof result === 'object' && 'error' in result && (result as any).error) {
    const { status, message } = result as { error: boolean; status: number; message: string };
    return c.json({ success: false, ret: status, data: null, message }, status as any);
  }
  return c.json(result);
};

/**
 * Create error result object
 */
export const errorResult = (status: number, message: string) => ({
  error: true,
  status,
  message
});
