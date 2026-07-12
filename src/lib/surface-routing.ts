export type Surface = "tob" | "toc";

const DEFAULT_ADMIN_DOMAINS = [
  "onfire.alkinum.com",
  "admin.localhost",
  "admin.127.0.0.1",
];
const DEFAULT_TOC_DOMAINS = [
  "support.alkinum.io",
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

export function isApiAllowedOnSurface(pathname: string, surface: Surface): boolean {
  if (pathname.startsWith("/api/tob")) return surface === "tob";
  if (pathname.startsWith("/api/toc")) return surface === "toc";
  return true;
}
