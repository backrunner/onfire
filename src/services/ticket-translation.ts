import type { Database } from "@/lib/db";
import { parseSupportedLanguages } from "@/lib/product-language";
import {
  jsonReplyTranslationMap,
  jsonTranslationMap,
  type ReplyTranslationMap,
} from "@/lib/tickets/translation";
import { translateTicketContent, translateTicketFields } from "@/services/ai/translation";
import { products } from "@/drizzle/schema";

type ProductRow = typeof products.$inferSelect;

export interface PreparedTicketTranslation {
  customerLanguage: string;
  subjectTranslations: string | null;
  contentTranslations: string | null;
}

export interface PreparedReplyTranslation {
  detectedLanguage: string;
  translations: string | null;
}

export function effectiveProductLanguages(product: ProductRow): string[] {
  const configured = parseSupportedLanguages(product.supportedLanguages);
  return configured.length > 0 ? configured : [product.defaultLanguage];
}

/**
 * Translate only after the caller has completed ticket validation/filtering.
 * Original customer text stays in the base columns; translations are cached
 * for every other portal language.
 */
export async function prepareTicketTranslation(
  db: Database,
  product: ProductRow,
  input: {
    subject: string;
    content: string;
    sourceLanguage?: string | null;
  }
): Promise<PreparedTicketTranslation> {
  const languages = effectiveProductLanguages(product);
  const knownSource = input.sourceLanguage && languages.includes(input.sourceLanguage)
    ? input.sourceLanguage
    : null;

  if (languages.length < 2) {
    return {
      customerLanguage: knownSource ?? product.defaultLanguage,
      subjectTranslations: null,
      contentTranslations: null,
    };
  }

  const targets = knownSource
    ? languages.filter((language) => language !== knownSource)
    : [product.defaultLanguage];
  const translated = await translateTicketFields(
    db,
    { tenantId: product.tenantId, productId: product.id },
    {
      subject: input.subject,
      content: input.content,
      sourceLang: knownSource,
      targetLangs: targets,
    }
  );
  const detected = knownSource ?? translated.detectedLanguage;
  return {
    customerLanguage: languages.includes(detected)
      ? detected
      : product.defaultLanguage,
    subjectTranslations: jsonTranslationMap(translated.subject),
    contentTranslations: jsonTranslationMap(translated.content),
  };
}

/**
 * Translate one reply to the reader language. When sourceLanguage is omitted,
 * the model detects it; this is used for agent and inbound-email replies.
 */
export async function prepareReplyTranslation(
  db: Database,
  product: ProductRow,
  input: {
    content: string;
    contentHtml?: string | null;
    sourceLanguage?: string | null;
    targetLanguage: string;
  }
): Promise<PreparedReplyTranslation> {
  const languages = effectiveProductLanguages(product);
  const targetLanguage = languages.includes(input.targetLanguage)
    ? input.targetLanguage
    : product.defaultLanguage;
  const knownSource = input.sourceLanguage && languages.includes(input.sourceLanguage)
    ? input.sourceLanguage
    : null;

  if (languages.length < 2 || knownSource === targetLanguage) {
    return {
      detectedLanguage: knownSource ?? targetLanguage,
      translations: null,
    };
  }

  const translated = await translateTicketContent(
    db,
    { tenantId: product.tenantId, productId: product.id },
    {
      text: input.content,
      html: input.contentHtml,
      sourceLang: knownSource,
      targetLang: targetLanguage,
    }
  );
  const map: ReplyTranslationMap = {
    [targetLanguage]: {
      content: translated.content,
      contentHtml: translated.contentHtml ?? null,
    },
  };
  return {
    detectedLanguage: translated.detectedLanguage,
    translations: jsonReplyTranslationMap(map),
  };
}
