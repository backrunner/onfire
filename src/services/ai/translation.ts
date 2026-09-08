/**
 * AI Translation Service
 * Batch plain-text translation plus ticket content translation with language
 * detection. HTML output must preserve the tag structure and is passed
 * through sanitizeRichHtml before it leaves this module.
 */

import type { Database } from "@/lib/db";
import type { AIRuntimeContext } from "@/lib/ai-scope";
import {
  decodeEntities,
  escapeRichText,
  sanitizeRichHtml,
} from "@/lib/rich-text";
import { getAIProvider } from "./config";
import type { AIProvider } from "./providers";

export interface TranslateTextsInput {
  sourceLang: string;
  targetLangs: string[];
  texts: { id: string; text: string }[];
}

export type TranslateTextsResult = Record<string, Record<string, string>>;

export interface TranslateTicketContentInput {
  text: string;
  html?: string | null;
  /** Known source language (BCP-47); when set, detection is skipped. */
  sourceLang?: string | null;
  targetLang: string;
}

export interface TranslateTicketContentResult {
  detectedLanguage: string;
  content: string;
  contentHtml?: string;
}

export interface TranslateTicketFieldsInput {
  subject: string;
  content: string;
  sourceLang?: string | null;
  targetLangs: string[];
}

export interface TranslateTicketFieldsResult {
  detectedLanguage: string;
  subject: Record<string, string>;
  content: Record<string, string>;
}

const TRANSLATE_TEXTS_PROMPT = `You are a professional translator. Translate each text {{sourceClause}} into every one of these target languages: {{targetLangs}}.

Rules:
- Preserve the original meaning, tone, and line breaks of each text.
- Keep placeholder variables of the form {{...}} and every HTML tag, attribute, and structure unchanged; translate only the human-readable text around them.
- If a text is already in the target language, return it unchanged.
- Use the exact "id" values and language codes from the user message as keys.

Respond in JSON format only:
{
  "translations": {
    "<text id>": { "<language code>": "translated text" }
  }
}`;

const TRANSLATE_TICKET_PROMPT = `You are a professional translator. Translate the ticket content into {{targetLang}}.

Rules:
- If the source text is already in {{targetLang}}, return it unchanged.
- Keep placeholder variables of the form {{...}} unchanged.
- "content" is the translated plain text.
- When HTML is provided, translate only the text nodes and keep every HTML tag, attribute, and the overall document structure unchanged; return the translated markup as "contentHtml". When no HTML is provided, set "contentHtml" to null.
{{languageRule}}

Respond in JSON format only:
{
  "detectedLanguage": "en",
  "content": "translated plain text",
  "contentHtml": "translated HTML or null"
}`;

const LANGUAGE_DETECTION_RULE =
  '- Report the detected source language as a short BCP-47 code (e.g. "en", "zh", "ja") in "detectedLanguage".';

const TRANSLATE_TICKET_FIELDS_PROMPT = `You are a professional translator. Translate a support ticket subject and content into every target language: {{targetLangs}}.

Rules:
- {{sourceRule}}
- Preserve meaning, tone, whitespace, and line breaks.
- Keep placeholder variables of the form {{...}} unchanged.
- If a field is already in a target language, return it unchanged for that target.
- Use the exact target language codes as keys and include every requested target.

Respond in JSON format only:
{
  "detectedLanguage": "en",
  "translations": {
    "subject": { "<language code>": "translated subject" },
    "content": { "<language code>": "translated content" }
  }
}`;

const TRANSLATION_CHUNK_SIZE = 4_000;

/**
 * Source-language clause for TRANSLATE_TEXTS_PROMPT. A failed detection
 * reports "unknown"; that hint would confuse the model, so the prompt then
 * asks for detection instead of naming a language.
 */
function textBatchSourceClause(sourceLang: string | null | undefined): string {
  return sourceLang && sourceLang !== "unknown"
    ? `from ${sourceLang}`
    : "from its original language";
}

function splitTextChunks(value: string, maxSize = TRANSLATION_CHUNK_SIZE): string[] {
  if (value.length <= maxSize) return [value];
  const chars = Array.from(value);
  const chunks: string[] = [];
  let start = 0;
  while (start < chars.length) {
    const end = Math.min(start + maxSize, chars.length);
    if (end === chars.length) {
      chunks.push(chars.slice(start).join(""));
      break;
    }
    const window = chars.slice(start, end).join("");
    const boundary = Math.max(
      window.lastIndexOf("\n"),
      window.lastIndexOf("。"),
      window.lastIndexOf("！"),
      window.lastIndexOf("？"),
      window.lastIndexOf("."),
      window.lastIndexOf("!"),
      window.lastIndexOf("?")
    );
    const boundarySize = boundary >= 0
      ? Array.from(window.slice(0, boundary + 1)).length
      : 0;
    const cut = boundarySize >= Math.floor(maxSize * 0.65)
      ? boundarySize
      : maxSize;
    chunks.push(chars.slice(start, start + cut).join(""));
    start += cut;
  }
  return chunks;
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse AI translation response as JSON");
  }
  const parsed: unknown = JSON.parse(jsonMatch[0]);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI translation response is not a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function readDetectedLanguage(parsed: Record<string, unknown>, fallback: string) {
  return typeof parsed.detectedLanguage === "string" && parsed.detectedLanguage.trim()
    ? parsed.detectedLanguage.trim().toLowerCase().split("-")[0]
    : fallback;
}

async function translateContentChunk(
  provider: AIProvider,
  text: string,
  sourceLang: string | null,
  targetLang: string,
) {
  const languageRule = sourceLang
    ? `- The source language is known to be "${sourceLang}"; report it in "detectedLanguage" without detecting.`
    : LANGUAGE_DETECTION_RULE;
  const result = await provider.complete({
    messages: [
      {
        role: "system",
        content: TRANSLATE_TICKET_PROMPT.replace(
          /\{\{targetLang\}\}/g,
          targetLang
        ).replace("{{languageRule}}", languageRule),
      },
      { role: "user", content: `Text:\n${text}` },
    ],
    temperature: 0.2,
    maxTokens: 4096,
  });
  const parsed = extractJsonObject(result.content);
  if (typeof parsed.content !== "string" || !parsed.content.trim()) {
    throw new Error("AI translation response has no translated content");
  }
  return {
    detectedLanguage: readDetectedLanguage(parsed, sourceLang ?? "unknown"),
    content: parsed.content,
  };
}

async function translateHtmlTextNodes(
  provider: AIProvider,
  html: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const segments: Array<{ literal?: string; ids?: string[] }> = [];
  const items: Array<{ id: string; text: string }> = [];
  for (const token of html.match(/<[^>]+>|[^<]+/g) ?? []) {
    if (token.startsWith("<") || !decodeEntities(token).trim()) {
      segments.push({ literal: token });
      continue;
    }
    const ids: string[] = [];
    for (const chunk of splitTextChunks(decodeEntities(token))) {
      const id = `html-${items.length}`;
      items.push({ id, text: chunk });
      ids.push(id);
    }
    segments.push({ ids });
  }
  if (items.length === 0) return html;

  const translated: Record<string, string> = {};
  let group: Array<{ id: string; text: string }> = [];
  let groupSize = 0;
  const flush = async () => {
    if (group.length === 0) return;
    const result = await provider.complete({
      messages: [
        {
          role: "system",
          content: TRANSLATE_TEXTS_PROMPT.replace(
            "{{sourceClause}}",
            textBatchSourceClause(sourceLang)
          ).replace("{{targetLangs}}", targetLang),
        },
        { role: "user", content: JSON.stringify(group) },
      ],
      temperature: 0.2,
      maxTokens: 4096,
    });
    const parsed = extractJsonObject(result.content);
    const maps = parsed.translations;
    if (!maps || typeof maps !== "object" || Array.isArray(maps)) {
      throw new Error("AI translation response has no translations object");
    }
    for (const item of group) {
      const map = (maps as Record<string, unknown>)[item.id];
      const value = map && typeof map === "object" && !Array.isArray(map)
        ? (map as Record<string, unknown>)[targetLang]
        : null;
      if (typeof value !== "string" || !value.trim()) {
        throw new Error(`AI translation response is incomplete for ${item.id}:${targetLang}`);
      }
      translated[item.id] = value;
    }
    group = [];
    groupSize = 0;
  };
  for (const item of items) {
    if (group.length > 0 && (group.length >= 20 || groupSize + item.text.length > TRANSLATION_CHUNK_SIZE)) {
      await flush();
    }
    group.push(item);
    groupSize += item.text.length;
  }
  await flush();

  return sanitizeRichHtml(
    segments
      .map((segment) =>
        segment.literal ?? segment.ids!.map((id) => escapeRichText(translated[id])).join("")
      )
      .join("")
  );
}

const TEXTS_BATCH_MAX_ITEMS = 20;
const TEXTS_BATCH_MAX_CHARS = 8_000;

/** Translate one bounded batch of texts; throws on an incomplete response. */
async function translateTextsBatch(
  provider: AIProvider,
  sourceLang: string,
  targetLangs: string[],
  texts: { id: string; text: string }[]
): Promise<TranslateTextsResult> {
  const result = await provider.complete({
    messages: [
      {
        role: "system",
        content: TRANSLATE_TEXTS_PROMPT.replace(
          "{{sourceClause}}",
          textBatchSourceClause(sourceLang)
        ).replace("{{targetLangs}}", targetLangs.join(", ")),
      },
      { role: "user", content: JSON.stringify(texts) },
    ],
    temperature: 0.2,
    maxTokens: 4096,
  });

  const parsed = extractJsonObject(result.content);
  const rawTranslations = parsed.translations;
  if (!rawTranslations || typeof rawTranslations !== "object") {
    throw new Error("AI translation response has no translations object");
  }

  const allowedLangs = new Set(targetLangs);
  const allowedIds = new Set(texts.map((item) => item.id));
  const translations: TranslateTextsResult = {};
  for (const [id, langMap] of Object.entries(
    rawTranslations as Record<string, unknown>
  )) {
    if (!allowedIds.has(id) || !langMap || typeof langMap !== "object") continue;
    const cleaned: Record<string, string> = {};
    for (const [lang, value] of Object.entries(
      langMap as Record<string, unknown>
    )) {
      if (typeof value === "string" && allowedLangs.has(lang)) {
        cleaned[lang] = value;
      }
    }
    if (Object.keys(cleaned).length > 0) {
      translations[id] = cleaned;
    }
  }
  for (const item of texts) {
    for (const language of targetLangs) {
      if (!translations[item.id]?.[language]?.trim()) {
        throw new Error(
          `AI translation response is incomplete for ${item.id}:${language}`
        );
      }
    }
  }
  return translations;
}

export async function translateTexts(
  db: Database,
  context: AIRuntimeContext,
  input: TranslateTextsInput
): Promise<TranslateTextsResult> {
  const targetLangs = [...new Set(input.targetLangs)].filter(
    (language) => language && language !== input.sourceLang
  );
  if (input.texts.length === 0 || targetLangs.length === 0) {
    return {};
  }
  const provider = await getAIProvider(db, "translation", context);
  if (!provider) {
    throw new Error("Translation AI task is not configured");
  }

  // A single call with up to 100 texts can exceed the completion token budget
  // and come back truncated; batch by item count and input size and merge.
  // A failed batch fails the whole translation, matching the existing
  // blocking semantics.
  const translations: TranslateTextsResult = {};
  let batch: TranslateTextsInput["texts"] = [];
  let batchChars = 0;
  const flush = async () => {
    if (batch.length === 0) return;
    Object.assign(
      translations,
      await translateTextsBatch(provider, input.sourceLang, targetLangs, batch)
    );
    batch = [];
    batchChars = 0;
  };
  for (const item of input.texts) {
    if (
      batch.length > 0 &&
      (batch.length >= TEXTS_BATCH_MAX_ITEMS ||
        batchChars + item.text.length > TEXTS_BATCH_MAX_CHARS)
    ) {
      await flush();
    }
    batch.push(item);
    batchChars += item.text.length;
  }
  await flush();
  return translations;
}

/** Translate the subject and plain body in one model call for ticket intake. */
export async function translateTicketFields(
  db: Database,
  context: AIRuntimeContext,
  input: TranslateTicketFieldsInput
): Promise<TranslateTicketFieldsResult> {
  const targets = [...new Set(input.targetLangs)].filter(
    (language) => language && language !== input.sourceLang
  );
  if (targets.length === 0) {
    return {
      detectedLanguage: input.sourceLang ?? "unknown",
      subject: {},
      content: {},
    };
  }
  const provider = await getAIProvider(db, "translation", context);
  if (!provider) {
    throw new Error("Translation AI task is not configured");
  }
  const contentChunks = splitTextChunks(input.content);
  if (contentChunks.length > 1) {
    let detectedLanguage = input.sourceLang ?? "unknown";
    let sourceDetected = Boolean(input.sourceLang);
    const subject: Record<string, string> = {};
    const content: Record<string, string> = Object.fromEntries(
      targets.map((language) => [language, ""])
    );
    for (let index = 0; index < contentChunks.length; index += 1) {
      const sourceLang = input.sourceLang ?? (sourceDetected ? detectedLanguage : null);
      const sourceRule = sourceLang
        ? `The source language is ${sourceLang}; report that exact code as detectedLanguage`
        : "Detect the source language and report a short BCP-47 code as detectedLanguage";
      const result = await provider.complete({
        messages: [
          {
            role: "system",
            content: TRANSLATE_TICKET_FIELDS_PROMPT.replace(
              "{{targetLangs}}",
              targets.join(", ")
            ).replace("{{sourceRule}}", sourceRule),
          },
          {
            role: "user",
            content: JSON.stringify({
              subject: index === 0 ? input.subject : "",
              content: contentChunks[index],
            }),
          },
        ],
        temperature: 0.2,
        maxTokens: 4096,
      });
      const parsed = extractJsonObject(result.content);
      const translations = parsed.translations;
      if (!translations || typeof translations !== "object" || Array.isArray(translations)) {
        throw new Error("AI translation response has no translations object");
      }
      const map = translations as Record<string, unknown>;
      const clean = (value: unknown) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return {};
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>).filter(
            ([language, text]) =>
              targets.includes(language) && typeof text === "string" && text.trim()
          )
        ) as Record<string, string>;
      };
      const chunkSubject = clean(map.subject);
      const chunkContent = clean(map.content);
      if (index === 0) {
        for (const language of targets) {
          if (!chunkSubject[language]?.trim()) {
            throw new Error(`AI translation response is incomplete for ${language}`);
          }
          subject[language] = chunkSubject[language];
        }
      }
      for (const language of targets) {
        if (!contentChunks[index].trim()) {
          content[language] += contentChunks[index];
          continue;
        }
        if (!chunkContent[language]?.trim()) {
          throw new Error(`AI translation response is incomplete for ${language}`);
        }
        content[language] += chunkContent[language];
      }
      detectedLanguage = input.sourceLang ?? readDetectedLanguage(parsed, detectedLanguage);
      sourceDetected = sourceDetected || detectedLanguage !== "unknown";
    }
    return { detectedLanguage: input.sourceLang ?? detectedLanguage, subject, content };
  }
  const sourceRule = input.sourceLang
    ? `The source language is ${input.sourceLang}; report that exact code as detectedLanguage`
    : "Detect the source language and report a short BCP-47 code as detectedLanguage";
  const result = await provider.complete({
    messages: [
      {
        role: "system",
        content: TRANSLATE_TICKET_FIELDS_PROMPT.replace(
          "{{targetLangs}}",
          targets.join(", ")
        ).replace("{{sourceRule}}", sourceRule),
      },
      {
        role: "user",
        content: JSON.stringify({ subject: input.subject, content: input.content }),
      },
    ],
    temperature: 0.2,
    maxTokens: 4096,
  });
  const parsed = extractJsonObject(result.content);
  const translations = parsed.translations;
  if (!translations || typeof translations !== "object" || Array.isArray(translations)) {
    throw new Error("AI translation response has no translations object");
  }
  const subject = (translations as Record<string, unknown>).subject;
  const content = (translations as Record<string, unknown>).content;
  const clean = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(
        ([language, text]) =>
          targets.includes(language) && typeof text === "string" && text.trim()
      )
    ) as Record<string, string>;
  };
  const translatedSubject = clean(subject);
  const translatedContent = clean(content);
  for (const language of targets) {
    if (!translatedSubject[language]?.trim() || !translatedContent[language]?.trim()) {
      throw new Error(`AI translation response is incomplete for ${language}`);
    }
  }
  const detectedLanguage =
    input.sourceLang ?? (typeof parsed.detectedLanguage === "string" && parsed.detectedLanguage.trim()
      ? parsed.detectedLanguage.trim().toLowerCase().split("-")[0]
      : "unknown");
  return {
    detectedLanguage,
    subject: translatedSubject,
    content: translatedContent,
  };
}

export async function translateTicketContent(
  db: Database,
  context: AIRuntimeContext,
  input: TranslateTicketContentInput
): Promise<TranslateTicketContentResult> {
  const sanitizedInputHtml = input.html ? sanitizeRichHtml(input.html) : undefined;
  if (input.sourceLang === input.targetLang) {
    return {
      detectedLanguage: input.sourceLang,
      content: input.text,
      contentHtml: sanitizedInputHtml,
    };
  }
  // Image-only replies contain no language-bearing text and must remain usable
  // even when the translation route is unavailable.
  if (!input.text.trim() && sanitizedInputHtml &&
    !decodeEntities(sanitizedInputHtml.replace(/<[^>]+>/g, "")).trim()) {
    return {
      detectedLanguage: input.sourceLang ?? "unknown",
      content: input.text,
      contentHtml: sanitizedInputHtml,
    };
  }
  const provider = await getAIProvider(db, "translation", context);
  if (!provider) {
    throw new Error("Translation AI task is not configured");
  }

  const textChunks = splitTextChunks(input.text);
  const requiresChunks =
    textChunks.length > 1 || Boolean(sanitizedInputHtml);
  if (requiresChunks) {
    const translatedParts: string[] = [];
    let detectedLanguage = input.sourceLang ?? "unknown";
    let sourceDetected = Boolean(input.sourceLang);
    for (let index = 0; index < textChunks.length; index += 1) {
      if (!textChunks[index].trim()) {
        translatedParts.push(textChunks[index]);
        continue;
      }
      const translated = await translateContentChunk(
        provider,
        textChunks[index],
        input.sourceLang ?? (sourceDetected ? detectedLanguage : null),
        input.targetLang,
      );
      translatedParts.push(translated.content);
      detectedLanguage = input.sourceLang ?? translated.detectedLanguage;
      sourceDetected = sourceDetected || detectedLanguage !== "unknown";
    }
    const contentHtml = sanitizedInputHtml
      ? await translateHtmlTextNodes(
          provider,
          sanitizedInputHtml,
          input.sourceLang ?? detectedLanguage,
          input.targetLang,
        )
      : undefined;
    return {
      detectedLanguage: input.sourceLang ?? detectedLanguage,
      content: translatedParts.join(""),
      contentHtml,
    };
  }

  const translated = await translateContentChunk(
    provider, input.text, input.sourceLang ?? null, input.targetLang,
  );
  return {
    ...translated,
    detectedLanguage: input.sourceLang ?? translated.detectedLanguage,
  };
}
