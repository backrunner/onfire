export const TOC_PROXY_PREFIX = "/support";

/** Whether the current browser page is running behind the supported prefix. */
export function isTocProxyLocation(pathname?: string): boolean {
  const path =
    pathname ?? (typeof window !== "undefined" ? window.location.pathname : "");
  return path === TOC_PROXY_PREFIX || path.startsWith(`${TOC_PROXY_PREFIX}/`);
}

/** Prefix an application path only when the portal is mounted at /support. */
export function tocPath(path: string, pathname?: string): string {
  if (!path.startsWith("/")) throw new Error("ToC paths must be absolute");
  if (!isTocProxyLocation(pathname)) return path;
  if (path === TOC_PROXY_PREFIX || path.startsWith(`${TOC_PROXY_PREFIX}/`)) {
    return path;
  }
  return path === "/" ? TOC_PROXY_PREFIX : `${TOC_PROXY_PREFIX}${path}`;
}
