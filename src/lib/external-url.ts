/**
 * Only HTTP(S) destinations are valid product return links. Rejecting other
 * schemes keeps customer-facing redirects out of javascript:, data:, and
 * custom-protocol URL space.
 */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function isIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  );
}

function isPrivateIpv4(hostname: string): boolean {
  if (!isIpv4(hostname)) return false;
  const [a, b] = hostname.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const value = hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  return (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe8") ||
    value.startsWith("fe9") ||
    value.startsWith("fea") ||
    value.startsWith("feb") ||
    value.startsWith("ff") ||
    value.startsWith("::ffff:10.") ||
    value.startsWith("::ffff:127.") ||
    value.startsWith("::ffff:192.168.") ||
    value.startsWith("::ffff:172.")
  );
}

/**
 * Validate an administrator-configured outbound destination.
 *
 * Notification webhooks and custom AI gateways are server-side fetch sinks,
 * so HTTP(S) syntax alone is not sufficient. Require HTTPS, reject local and
 * special-use names/IP literals, and disallow credentials in the URL.
 */
export function safePublicHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      !hostname ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".home.arpa") ||
      hostname.endsWith(".lan") ||
      hostname.endsWith(".onion") ||
      isPrivateIpv4(hostname) ||
      (hostname.includes(":") && isPrivateIpv6(hostname)) ||
      (!hostname.includes(".") && !hostname.includes(":"))
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
