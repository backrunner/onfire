import { z } from "zod";

/** Bounded companion map used by ticket types, presets, and form schemas. */
export function i18nRecordSchema(maxValue: number) {
  return z.record(
    z.string().trim().min(2).max(16),
    z.string().max(maxValue),
  );
}

export const nullableI18nField = (maxValue: number) =>
  i18nRecordSchema(maxValue).nullable().optional();
