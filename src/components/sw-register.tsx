"use client";

import { useEffect } from "react";

/**
 * Service Worker Registration Component
 *
 * Registers the service worker only in production environment.
 * Should be included in the root layout.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    // Only register in production and if service workers are supported
    if (
      process.env.NODE_ENV === "production" &&
      typeof window !== "undefined" &&
      "serviceWorker" in navigator
    ) {
      // Register after the page has loaded
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .then((registration) => {
            console.log("SW registered:", registration.scope);

            // Check for updates periodically
            setInterval(() => {
              registration.update();
            }, 60 * 60 * 1000); // Check every hour
          })
          .catch((error) => {
            console.error("SW registration failed:", error);
          });
      });
    }
  }, []);

  return null;
}

/**
 * Clear the service worker cache
 * Can be called from anywhere in the app
 */
export function clearServiceWorkerCache(): void {
  if (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    navigator.serviceWorker.controller
  ) {
    navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHE" });
  }
}

/**
 * Unregister all service workers
 * Useful for debugging or when you want to disable SW
 */
export async function unregisterServiceWorkers(): Promise<void> {
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
    console.log("All service workers unregistered");
  }
}
