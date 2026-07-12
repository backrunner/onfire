import { safePublicHttpUrl } from "@/lib/external-url";

export const AI_TASK_TYPES = [
  "agent",
  "prescreening",
  "prereply",
  "embedding",
] as const;

export const LANGUAGE_AI_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "xai",
  "deepseek",
] as const;

export const EMBEDDING_AI_PROVIDERS = [
  "openai",
  "qwen",
  "jina",
  "cohere",
  "google",
] as const;

export const ALL_AI_PROVIDERS = [
  ...LANGUAGE_AI_PROVIDERS,
  "qwen",
  "jina",
  "cohere",
] as const;

export const OPENAI_API_MODES = ["responses", "chat"] as const;
export const EMBEDDING_DIMENSIONS = 1024;

/** Base URLs are server-side fetch destinations; keep them public HTTPS only. */
export function safeAIBaseUrl(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim() === "") return null;
  const normalized = safePublicHttpUrl(value);
  if (!normalized) return null;
  const url = new URL(normalized);
  if (url.search || url.hash) return null;
  return normalized.replace(/\/+$/, "");
}

export function isSafeAIBaseUrl(value: string | null | undefined): boolean {
  if (value === undefined || value === null || value.trim() === "") return true;
  return safeAIBaseUrl(value) !== null;
}

export type AITaskTypeValue = (typeof AI_TASK_TYPES)[number];
export type AIProviderValue = (typeof ALL_AI_PROVIDERS)[number];
export type OpenAIApiModeValue = (typeof OPENAI_API_MODES)[number];

export function isProviderAllowedForTask(
  taskType: AITaskTypeValue,
  provider: AIProviderValue
): boolean {
  return taskType === "embedding"
    ? EMBEDDING_AI_PROVIDERS.some((value) => value === provider)
    : LANGUAGE_AI_PROVIDERS.some((value) => value === provider);
}
