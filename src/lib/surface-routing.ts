export type Surface = "tob" | "toc";

const DEFAULT_ADMIN_DOMAINS = [
  "admin.example.com",
  "admin.localhost",
  "admin.127.0.0.1",
];
const DEFAULT_TOC_DOMAINS = [
  "support.example.com",
  "localhost",
  "127.0.0.1",
];

function parseDomains(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

export function classifySurface(
  host: string,
  config: {
    adminDomains?: string;
    tocDomains?: string;
    development?: boolean;
  } = {}
): Surface {
  const normalized = host.toLowerCase();
  const [hostname, port] = normalized.split(":");
  const adminDomains = parseDomains(config.adminDomains, DEFAULT_ADMIN_DOMAINS);
  const tocDomains = parseDomains(config.tocDomains, DEFAULT_TOC_DOMAINS);

  if (config.development && port === "3001") return "tob";
  if (config.development && port === "3000") return "toc";
  if (adminDomains.includes(hostname)) return "tob";
  if (tocDomains.includes(hostname)) return "toc";

  // Unknown hosts are treated as customer-facing. This keeps product-origin
  // reverse proxies working while never exposing ToB APIs on an unclassified
  // hostname.
  return "toc";
}

function requiredSurface(pathname: string): Surface | null {
  if (pathname.startsWith("/api/tob")) return "tob";
  if (pathname.startsWith("/api/toc")) return "toc";
  if (
    pathname === "/mcp" ||
    pathname.startsWith("/mcp/") ||
    pathname.startsWith("/.well-known/oauth-protected-resource") ||
    pathname.startsWith("/.well-known/oauth-authorization-server")
  ) {
    return "tob";
  }
  return null;
}

function normalizedPathCandidates(pathname: string): string[] | null {
  if (!pathname.startsWith("/")) return null;
  const candidates = new Set<string>();
  let current = pathname;
  for (let depth = 0; depth < 3; depth += 1) {
    candidates.add(current);
    try {
      candidates.add(new URL(current, "https://onfire.invalid").pathname);
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      return null;
    }
  }
  candidates.add(current);
  candidates.add(new URL(current, "https://onfire.invalid").pathname);
  return [...candidates];
}

export function isApiAllowedOnSurface(pathname: string, surface: Surface): boolean {
  const candidates = normalizedPathCandidates(pathname);
  if (!candidates) return false;
  for (const candidate of candidates) {
    const required = requiredSurface(candidate);
    if (required && required !== surface) return false;
  }
  return true;
}
