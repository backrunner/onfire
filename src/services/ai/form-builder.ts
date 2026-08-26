import type { Database } from "@/lib/db";
import {
  createEmptyFormSchema,
  parseFormSchemaValue,
  validateFormSchema,
  type FormSchema,
} from "@/lib/form-schema";
import { getAIProvider } from "./config";
import type { AIMessage } from "./providers";

export interface FormBuilderGenerationInput {
  message: string;
  currentSchema?: unknown;
  defaultLanguage: string;
  interfaceLanguage: string;
}

export interface FormBuilderGenerationResult {
  response: string;
  schema: FormSchema;
}

const FORM_BUILDER_PROMPT = `You are an expert support-form designer helping an administrator build a customer ticket form.

Generate a complete valid OnFire form schema from the administrator's request. The product's authored/default language is "{{defaultLanguage}}". Field labels, descriptions, placeholders, help text, option labels, section titles, and validation messages must be written in that language. Explain your changes in "{{interfaceLanguage}}".

The current draft schema is provided in the user message. Treat the administrator's latest request as an instruction to create or revise that draft. Preserve useful existing fields unless the request asks to remove them. Use stable, machine-readable lowercase snake_case field keys. Use only these field types: text, textarea, number, email, select, radio, checkbox, date. Select, radio, and checkbox fields must have at least one option with unique non-empty value strings. Conditions may reference only field IDs in the returned schema.

Return JSON only, with exactly this shape:
{
  "response": "A concise explanation of what you generated",
  "schema": {
    "version": "1.0",
    "fields": [],
    "layout": { "columns": 1, "sections": [] }
  }
}

Do not include markdown fences, comments, or any keys outside response and schema.`;

function extractJsonObject(raw: string): Record<string, unknown> {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI form response is not valid JSON");
  const parsed: unknown = JSON.parse(match[0]);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI form response is not a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function normalizedDraft(value: unknown): FormSchema {
  return parseFormSchemaValue(value) ?? createEmptyFormSchema();
}

export async function generateFormSchema(
  db: Database,
  context: { tenantId: string; productId: string },
  input: FormBuilderGenerationInput
): Promise<FormBuilderGenerationResult | null> {
  const provider = await getAIProvider(db, "agent", context);
  if (!provider) return null;

  const messages: AIMessage[] = [
    {
      role: "system",
      content: FORM_BUILDER_PROMPT
        .replace("{{defaultLanguage}}", input.defaultLanguage)
        .replace("{{interfaceLanguage}}", input.interfaceLanguage),
    },
    {
      role: "user",
      content: JSON.stringify({
        request: input.message,
        currentSchema: normalizedDraft(input.currentSchema),
      }),
    },
  ];
  const result = await provider.complete({ messages, temperature: 0.2, maxTokens: 6_000 });
  const parsed = extractJsonObject(result.content);
  const schema = parseFormSchemaValue(parsed.schema);
  if (!schema) throw new Error("AI form response contains an invalid schema");
  const errors = validateFormSchema(schema);
  if (errors.length > 0) throw new Error("AI form response failed schema validation");
  const response = typeof parsed.response === "string" && parsed.response.trim()
    ? parsed.response.trim()
    : "The form draft is ready to review.";
  return { response, schema };
}
