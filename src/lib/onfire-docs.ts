/** Canonical public documentation. Paths follow the site's configured locales. */
export function spamFilterSpecUrl(language: string, section?: "decision-api" | "custom-spam-api" | "classification") {
  return `https://onfire.pwp.sh/docs/${language === "zh" ? "zh/" : ""}guides/spam-filter/${section ? `#${section}` : ""}`;
}
