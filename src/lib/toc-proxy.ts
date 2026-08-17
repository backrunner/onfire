import { TOC_PROXY_PREFIX } from "@/lib/toc-path";
import type { Surface } from "@/lib/surface-routing";

const ALLOWED_TOC_PREFIXES = ["/_next/", "/api/toc/", "/api/attachments/", "/tickets/"];
const ALLOWED_TOC_PATHS = ["/", "/_next", "/api/toc", "/tickets", "/icon.svg", "/sw.js"];

export function isTocProxyStaticAsset(pathname: string): boolean {
  return pathname === "/sw.js" || pathname.startsWith("/_next/static/");
}

/** The admin hostname only needs prefixed build assets, never ToC pages/APIs. */
export function isTocProxyAllowedOnSurface(
  pathname: string,
  surface: Surface
): boolean {
  return surface !== "tob" || pathname.startsWith("/_next/static/");
}

export function stripTocProxyPrefix(pathname: string): string | null {
  if (pathname !== TOC_PROXY_PREFIX && !pathname.startsWith(`${TOC_PROXY_PREFIX}/`)) {
    return null;
  }
  const stripped = pathname.slice(TOC_PROXY_PREFIX.length) || "/";
  if (
    !ALLOWED_TOC_PATHS.includes(stripped) &&
    !ALLOWED_TOC_PREFIXES.some((prefix) => stripped.startsWith(prefix))
  ) {
    return null;
  }
  return stripped;
}

export function rewriteTocProxyRequest(request: Request): Request | null {
  const url = new URL(request.url);
  const stripped = stripTocProxyPrefix(url.pathname);
  if (stripped === null) return null;
  url.pathname = stripped;
  const headers = new Headers(request.headers);
  headers.set("x-onfire-proxy-prefix", TOC_PROXY_PREFIX);
  const rewritten = new Request(url, request);
  return new Request(rewritten, { headers });
}

export function rewriteTocProxyResponse(
  originalRequest: Request,
  response: Response
): Response {
  const headers = new Headers(response.headers);
  if (new URL(originalRequest.url).pathname === `${TOC_PROXY_PREFIX}/sw.js`) {
    headers.set("Service-Worker-Allowed", `${TOC_PROXY_PREFIX}/`);
  }

  const location = headers.get("location");
  if (location) {
    const requestUrl = new URL(originalRequest.url);
    const target = new URL(location, requestUrl);
    if (
      target.origin === requestUrl.origin &&
      target.pathname !== TOC_PROXY_PREFIX &&
      !target.pathname.startsWith(`${TOC_PROXY_PREFIX}/`)
    ) {
      target.pathname =
        target.pathname === "/"
          ? TOC_PROXY_PREFIX
          : `${TOC_PROXY_PREFIX}${target.pathname}`;
      headers.set("location", target.toString());
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
