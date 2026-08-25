/**
 * Product content-language helpers: the product's default/supported language
 * set, request-time language resolution for ToC projections, and validation
 * of per-language i18n maps (`Record<lang, string>`) stored on content rows.
 *
 * The languages a product may enable mirror the UI languages in
 * `@/lib/i18n` (`Language = "en" | "zh"`); kept separate so server modules
 * do not pull the React provider into the bundle.
 */

import type { NextRequest } from "next/server";

// Mirrors LANGUAGE_COOKIE in @/lib/i18n (and @/lib/api/error-messages). Kept
// as a local constant so this module stays importable from client components
// (error-messages transitively pulls in next/server).
const LANGUAGE_COOKIE = "onfire-lang";

export const PRODUCT_LANGUAGES = ["en", "zh"] as const;
export type ProductLanguage = (typeof PRODUCT_LANGUAGES)[number];

/**
 * Explicit language choice on a ToC request: the `?lang=` query parameter
 * wins over the `onfire-lang` cookie. Returns null when neither is set;
 * membership in the product's supported set is checked by
 * `resolveProductLanguage`.
 */
export function requestedTocLanguage(req: NextRequest): string | null {
  const param = req.nextUrl.searchParams.get("lang");
  if (param) return param;
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(
    new RegExp(`(?:^|;\\s*)${LANGUAGE_COOKIE}=([\\w-]+)`)
  );
  return match?.[1] ?? null;
}

/** Columns carrying the product language configuration. */
export interface ProductLanguageConfig {
  defaultLanguage: string;
  /** JSON array of language codes, or null for a single-language product. */
  supportedLanguages: string | null;
}

/** Parse the JSON `supportedLanguages` column into a clean code list. */
export function parseSupportedLanguages(
  raw: string | null | undefined
): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(parsed.filter((v): v is string => typeof v === "string")),
    ];
  } catch {
    return [];
  }
}

/** Parse a JSON i18n companion column (`Record<lang, string>`). */
export function parseI18nRecord(
  raw: string | null | undefined
): Record<string, string> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record: Record<string, string> = {};
    for (const [lang, value] of Object.entries(parsed)) {
      if (typeof value === "string") record[lang] = value;
    }
    return record;
  } catch {
    return null;
  }
}

/** Base language tags from an Accept-Language header, strongest first. */
function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="));
      const quality = q ? Number(q.slice(2)) : 1;
      return { tag: tag.toLowerCase().split("-")[0], quality };
    })
    .filter((entry) => entry.tag && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality)
    .map((entry) => entry.tag);
}

/**
 * Resolve the language used to project product content:
 * `requestedLang` (explicit choice: query param / cookie) wins when
 * supported, then the Accept-Language header intersected with the product
 * languages, then the product default. A product without a configured
 * supported set always serves its default language.
 */
export function resolveProductLanguage(
  product: ProductLanguageConfig,
  requestedLang?: string | null,
  acceptLanguage?: string | null
): string {
  const supported = parseSupportedLanguages(product.supportedLanguages);
  if (supported.length === 0) return product.defaultLanguage;
  if (requestedLang && supported.includes(requestedLang)) return requestedLang;
  for (const tag of parseAcceptLanguage(acceptLanguage)) {
    if (supported.includes(tag)) return tag;
  }
  return product.defaultLanguage;
}

/**
 * Language keys used by the given i18n maps that fall outside
 * `supportedLanguages` (sorted, deduplicated). An empty supported set
 * forbids all i18n keys.
 */
export function unsupportedI18nKeys(
  maps: Array<Record<string, string> | null | undefined>,
  supportedLanguages: string[]
): string[] {
  const supported = new Set(supportedLanguages);
  const unsupported = new Set<string>();
  for (const map of maps) {
    if (!map) continue;
    for (const lang of Object.keys(map)) {
      if (!supported.has(lang)) unsupported.add(lang);
    }
  }
  return [...unsupported].sort();
}
