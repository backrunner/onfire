import { z } from "zod";

/** Bounded companion map used by ticket types, presets, and form schemas.
 * Empty values are rejected: writers drop empty keys instead, and an empty
 * string would defeat the `?? base` fallback in language projections. */
export function i18nRecordSchema(maxValue: number) {
  return z.record(
    z.string().trim().min(2).max(16),
    z.string().trim().min(1).max(maxValue),
  );
}

export const nullableI18nField = (maxValue: number) =>
  i18nRecordSchema(maxValue).nullable().optional();
