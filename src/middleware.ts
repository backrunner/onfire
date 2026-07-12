import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Multi-domain routing: one Worker serves both surfaces.
 *  - Admin domains   → rewritten under /admin (ToB console)
 *  - ToC domains     → customer portal at /
 *
 * Domains are configured via env (comma-separated host names):
 *   ADMIN_DOMAINS / NEXT_PUBLIC_ADMIN_DOMAINS
 *   TOC_DOMAINS   / NEXT_PUBLIC_TOC_DOMAINS
 * In development (or NEXT_PUBLIC_PORT_ROUTING=true) routing is port-based:
 * ToC on NEXT_PUBLIC_TOC_PORT (3000), ToB on NEXT_PUBLIC_TOB_PORT (3001).
 */

function parseDomains(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

const ADMIN_DOMAINS = parseDomains(
  process.env.ADMIN_DOMAINS || process.env.NEXT_PUBLIC_ADMIN_DOMAINS,
  ["onfire.alkinum.com", "admin.localhost", "admin.127.0.0.1"]
);

const TOC_DOMAINS = parseDomains(
  process.env.TOC_DOMAINS || process.env.NEXT_PUBLIC_TOC_DOMAINS,
  ["support.alkinum.io", "localhost", "127.0.0.1"]
);

const TOC_PORT = process.env.NEXT_PUBLIC_TOC_PORT || "3000";
const TOB_PORT = process.env.NEXT_PUBLIC_TOB_PORT || "3001";

const portBasedRouting =
  process.env.NEXT_PUBLIC_PORT_ROUTING === "true" ||
  process.env.NODE_ENV === "development";

/** Exact host match (port stripped) — `includes` would be spoofable. */
function matchesDomain(hostname: string, domains: string[]): boolean {
  return domains.includes(hostname);
}

export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") || "").toLowerCase();
  const [hostname, port] = host.split(":");
  const pathname = request.nextUrl.pathname;
  const tocProxyRequest =
    request.headers.get("x-onfire-proxy-prefix") === "/support";

  // Skip API routes, static files, and Next.js internals
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // worker.ts has already constrained and stripped /support. Keep this
  // request on the ToC surface regardless of the upstream Host header.
  if (tocProxyRequest) return NextResponse.next();

  if (portBasedRouting && port) {
    if (port === TOB_PORT) {
      if (pathname.startsWith("/admin")) return NextResponse.next();
      return NextResponse.rewrite(new URL(`/admin${pathname}`, request.url));
    }
    if (port === TOC_PORT) {
      if (pathname.startsWith("/admin")) {
        return NextResponse.redirect(new URL("/", request.url));
      }
      return NextResponse.next();
    }
  }

  if (matchesDomain(hostname, ADMIN_DOMAINS)) {
    if (pathname.startsWith("/admin")) return NextResponse.next();
    return NextResponse.rewrite(new URL(`/admin${pathname}`, request.url));
  }

  if (matchesDomain(hostname, TOC_DOMAINS)) {
    if (pathname.startsWith("/admin")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
