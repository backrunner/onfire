/** Accept a positive, safe decimal number, optionally displayed as #123. */
export function parseTicketNumber(value: string): number | null {
  const digits = value.trim().replace(/^#/, "");
  if (!/^[1-9]\d*$/.test(digits)) return null;
  const number = Number(digits);
  return Number.isSafeInteger(number) ? number : null;
}
