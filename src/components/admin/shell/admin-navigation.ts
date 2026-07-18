function normalizeAdminPathname(pathname: string): string {
  const withoutTrailingSlash =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return withoutTrailingSlash === "/" ? "/admin" : withoutTrailingSlash;
}

export function isAdminNavItemActive(
  pathname: string,
  href: string,
  exact = false
): boolean {
  const current = normalizeAdminPathname(pathname);
  const target = normalizeAdminPathname(href);
  return exact
    ? current === target
    : current === target || current.startsWith(`${target}/`);
}
