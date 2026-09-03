const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse a `From`-style mailbox header into an address and display name.
 * Accepts `Display Name <addr@example.com>`, `"Quoted Name" <addr>` and a
 * bare `addr@example.com`. Returns null when no usable address is present.
 */
export function parseMailboxHeader(
  value: string | null | undefined
): { email: string; name?: string } | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const angle = trimmed.match(/^(.*)<([^\s<>]+@[^\s<>]+)>\s*$/);
  if (angle) {
    const email = angle[2].toLowerCase();
    if (!EMAIL_PATTERN.test(email) || email.length > 320) return null;
    const name = angle[1]
      .trim()
      .replace(/^"|"$/g, "")
      .trim();
    return { email, name: name || undefined };
  }

  const bare = trimmed.toLowerCase();
  if (!EMAIL_PATTERN.test(bare) || bare.length > 320) return null;
  return { email: bare };
}
