import { safePublicHttpUrl } from "@/lib/external-url";

export const AI_TASK_TYPES = [
  "agent",
  "prescreening",
  "prereply",
  "translation",
  "embedding",
  "rerank",
] as const;

export const LANGUAGE_AI_PROVIDERS = [
  "openai",
  "openrouter",
  "anthropic",
  "google",
  "xai",
  "deepseek",
] as const;

export const EMBEDDING_AI_PROVIDERS = [
  "openai",
  "openrouter",
  "qwen",
  "jina",
  "cohere",
  "google",
] as const;

export const RERANK_AI_PROVIDERS = ["cohere", "jina"] as const;

export const ALL_AI_PROVIDERS = [
  ...LANGUAGE_AI_PROVIDERS,
  "qwen",
  "jina",
  "cohere",
] as const;

export const OPENAI_API_MODES = ["responses", "chat"] as const;
export const EMBEDDING_DIMENSIONS = 1024;

export type AIModelKind = "text" | "embedding" | "rerank";

/** The capability expected by each route. Keep this server-side contract in one place. */
export function modelKindForTask(taskType: AITaskTypeValue): AIModelKind {
  if (taskType === "embedding") return "embedding";
  if (taskType === "rerank") return "rerank";
  return "text";
}

/** Legacy-row fallback only. New and updated routes use provider catalog metadata. */
export function classifyAIModel(model: string): AIModelKind {
  const value = model.toLowerCase();
  if (/rerank|cross[-_ ]?encoder|ranker/.test(value)) return "rerank";
  if (/embed|embedding|bge[-_ ]?m3|e5[-_ ]|gte[-_ ]|multilingual[-_ ]?e5|text[-_ ]embedding/.test(value)) {
    return "embedding";
  }
  return "text";
}

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
  const providers = taskType === "embedding"
    ? EMBEDDING_AI_PROVIDERS
    : taskType === "rerank"
      ? RERANK_AI_PROVIDERS
      : LANGUAGE_AI_PROVIDERS;
  return providers.some((value) => value === provider);
}
