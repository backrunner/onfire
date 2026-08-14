export function safeSameOriginRedirect(
  value: unknown,
  origin: string,
  fallback = "/admin",
): string {
  if (typeof value !== "string" || !value) return fallback;
  try {
    const base = new URL(origin);
    const target = new URL(value, base);
    if (
      target.origin !== base.origin ||
      target.username ||
      target.password ||
      (target.protocol !== "https:" && target.protocol !== "http:")
    ) {
      return fallback;
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
