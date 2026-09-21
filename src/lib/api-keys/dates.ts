/** datetime-local inputs display local time; API timestamps are always UTC. */
export function localKeyExpiry(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export function defaultKeyExpiry(): string {
  return localKeyExpiry(new Date(Date.now() + 90 * 86400000).toISOString());
}
