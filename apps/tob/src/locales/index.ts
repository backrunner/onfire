import { zh } from './zh';
import { en } from './en';
import type { Locale } from '@onfire/ui';

export const translations: Record<Locale, typeof zh> = {
  zh,
  en
};

export type { Translations } from './zh';
