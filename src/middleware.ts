import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Admin domains - these will be rewritten to /admin routes
const ADMIN_DOMAINS = [
  "admin.onfire.app",
  "admin.localhost",
  "admin.127.0.0.1",
];

// ToC domains - customer portal
const TOC_DOMAINS = [
  "support.onfire.app",
  "localhost",
  "127.0.0.1",
];

// Port-based routing configuration
const TOC_PORT = process.env.NEXT_PUBLIC_TOC_PORT || "3000";
const TOB_PORT = process.env.NEXT_PUBLIC_TOB_PORT || "3001";

function isPortBasedRoutingEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_PORT_ROUTING === "true" ||
    process.env.NODE_ENV === "development"
  );
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;

  // Skip API routes, static files, and Next.js internals
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Port-based routing (development mode or explicitly enabled)
  if (isPortBasedRoutingEnabled()) {
    const port = host.split(":")[1];

    // ToB port → rewrite to /admin routes
    if (port === TOB_PORT) {
      if (pathname.startsWith("/admin")) {
        return NextResponse.next();
      }
      return NextResponse.rewrite(new URL(`/admin${pathname}`, request.url));
    }

    // ToC port → ensure not accessing /admin
    if (port === TOC_PORT) {
      if (pathname.startsWith("/admin")) {
        return NextResponse.redirect(new URL("/", request.url));
      }
      return NextResponse.next();
    }
  }

  // Check if this is an admin domain
  const isAdminDomain = ADMIN_DOMAINS.some((d) => host.includes(d));

  // Check if this is a ToC domain
  const isTocDomain = TOC_DOMAINS.some((d) => host.includes(d));

  // Admin domain → rewrite to /admin routes
  if (isAdminDomain) {
    // If already on /admin path, continue
    if (pathname.startsWith("/admin")) {
      return NextResponse.next();
    }
    // Rewrite root and other paths to /admin
    return NextResponse.rewrite(new URL(`/admin${pathname}`, request.url));
  }

  // ToC domain → ensure not accessing /admin
  if (isTocDomain) {
    if (pathname.startsWith("/admin")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
