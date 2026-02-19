/**
 * Cloudflare KV Cache Layer
 *
 * Provides a simple caching interface for API responses.
 * Uses Cloudflare KV for distributed caching across edge locations.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface CacheOptions {
  /** Time to live in seconds */
  ttl?: number;
  /** Cache tags for invalidation */
  tags?: string[];
}

interface CacheEntry<T> {
  data: T;
  tags?: string[];
  expiresAt: number;
}

const DEFAULT_TTL = 300; // 5 minutes

/**
 * Get the KV namespace binding
 */
async function getKV(): Promise<KVNamespace | null> {
  try {
    const ctx = await getCloudflareContext();
    return (ctx.env as { CACHE?: KVNamespace }).CACHE || null;
  } catch {
    // Not running in Cloudflare environment
    return null;
  }
}

/**
 * Get a value from cache
 */
export async function getFromCache<T>(key: string): Promise<T | null> {
  const kv = await getKV();
  if (!kv) return null;

  try {
    const entry = await kv.get<CacheEntry<T>>(key, "json");
    if (!entry) return null;

    // Check if expired (KV TTL should handle this, but double-check)
    if (Date.now() > entry.expiresAt) {
      await kv.delete(key);
      return null;
    }

    return entry.data;
  } catch (error) {
    console.error("Cache get error:", error);
    return null;
  }
}

/**
 * Set a value in cache
 */
export async function setCache<T>(
  key: string,
  value: T,
  options?: CacheOptions
): Promise<void> {
  const kv = await getKV();
  if (!kv) return;

  const ttl = options?.ttl ?? DEFAULT_TTL;
  const entry: CacheEntry<T> = {
    data: value,
    tags: options?.tags,
    expiresAt: Date.now() + ttl * 1000,
  };

  try {
    await kv.put(key, JSON.stringify(entry), {
      expirationTtl: ttl,
    });
  } catch (error) {
    console.error("Cache set error:", error);
  }
}

/**
 * Delete a specific key from cache
 */
export async function deleteCache(key: string): Promise<void> {
  const kv = await getKV();
  if (!kv) return;

  try {
    await kv.delete(key);
  } catch (error) {
    console.error("Cache delete error:", error);
  }
}

/**
 * Invalidate cache by prefix pattern
 * Note: KV list operation can be slow for large datasets
 */
export async function invalidateCacheByPrefix(prefix: string): Promise<void> {
  const kv = await getKV();
  if (!kv) return;

  try {
    const list = await kv.list({ prefix });
    await Promise.all(list.keys.map((key) => kv.delete(key.name)));
  } catch (error) {
    console.error("Cache invalidate error:", error);
  }
}

// ============================================
// Cache Key Builders
// ============================================

export const CacheKeys = {
  /** Products list for a tenant */
  products: (tenantId: string) => `products:${tenantId}`,

  /** Teams list for a tenant */
  teams: (tenantId: string) => `teams:${tenantId}`,

  /** Templates list for a product */
  templates: (productId: string) => `templates:${productId}`,

  /** User context (permissions, teams, etc.) */
  userContext: (userId: string) => `user:ctx:${userId}`,

  /** Dashboard stats for a tenant */
  dashboard: (tenantId: string) => `dashboard:${tenantId}`,

  /** Category routes for a product */
  categoryRoutes: (productId: string) => `category-routes:${productId}`,
};

// ============================================
// Cache TTL Constants (in seconds)
// ============================================

export const CacheTTL = {
  /** Static configuration (products, teams, templates) */
  STATIC_CONFIG: 600, // 10 minutes

  /** User context and permissions */
  USER_CONTEXT: 300, // 5 minutes

  /** Dashboard statistics */
  DASHBOARD: 120, // 2 minutes

  /** Dynamic data (tickets) */
  DYNAMIC: 60, // 1 minute
};

// ============================================
// Cache-aware wrapper functions
// ============================================

/**
 * Get or set cache with a factory function
 */
export async function getOrSet<T>(
  key: string,
  factory: () => Promise<T>,
  options?: CacheOptions
): Promise<T> {
  // Try to get from cache first
  const cached = await getFromCache<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Generate fresh data
  const data = await factory();

  // Store in cache (don't await to avoid blocking)
  setCache(key, data, options).catch(console.error);

  return data;
}
