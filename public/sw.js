/**
 * OnFire Service Worker
 *
 * Caches static assets for improved performance.
 * Only active in production environment.
 */

const CACHE_NAME = "onfire-static-v1";

// Static asset patterns to cache
const STATIC_PATTERNS = [
  /\/_next\/static\//,
  /\/fonts\//,
  /\/images\//,
  /\.woff2?$/,
  /\.ttf$/,
  /\.ico$/,
  /\.png$/,
  /\.jpg$/,
  /\.jpeg$/,
  /\.svg$/,
  /\.webp$/,
];

/**
 * Check if a request URL matches static asset patterns
 */
function isStaticAsset(url) {
  return STATIC_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Install event - pre-cache critical assets
 */
self.addEventListener("install", (event) => {
  // Skip waiting to activate immediately
  self.skipWaiting();
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith("onfire-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );

  // Take control of all clients immediately
  self.clients.claim();
});

/**
 * Fetch event - serve from cache or network
 */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = request.url;

  // Only handle GET requests
  if (request.method !== "GET") {
    return;
  }

  // Skip API requests and non-static assets
  if (url.includes("/api/") || !isStaticAsset(url)) {
    return;
  }

  // Cache-first strategy for static assets
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached response and update cache in background
        event.waitUntil(updateCache(request));
        return cachedResponse;
      }

      // Fetch from network and cache
      return fetchAndCache(request);
    })
  );
});

/**
 * Fetch from network and store in cache
 */
async function fetchAndCache(request) {
  try {
    const response = await fetch(request);

    // Only cache successful responses
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.error("Fetch failed:", error);
    throw error;
  }
}

/**
 * Update cache in background (stale-while-revalidate)
 */
async function updateCache(request) {
  try {
    const response = await fetch(request);

    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response);
    }
  } catch (error) {
    // Silently fail - we already have a cached version
    console.warn("Background cache update failed:", error);
  }
}

/**
 * Message event - handle cache invalidation commands
 */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CLEAR_CACHE") {
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => {
        console.log("Cache cleared");
      })
    );
  }
});
