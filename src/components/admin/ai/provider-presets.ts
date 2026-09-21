import {
  isProviderAllowedForTask,
  type AIProviderValue,
  type AITaskTypeValue,
} from "@/lib/ai-config";

interface ProviderPreset {
  baseUrl: string;
  languageModels?: string[];
  decisionModels?: string[];
  embeddingModels?: string[];
  rerankModels?: string[];
}

// Suggestions checked against official catalogs/docs on 2026-09-21.
// Existing routes keep their saved IDs; refresh loads the credential's catalog.
export const PROVIDER_PRESETS: Record<AIProviderValue, ProviderPreset> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    languageModels: ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-6-astra"],
    embeddingModels: ["text-embedding-3-small", "text-embedding-3-large"],
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    languageModels: [
      "openai/gpt-5.6-luna",
      "google/gemini-3.8-flash",
      "deepseek/deepseek-v4.1-flash",
      "anthropic/claude-sonnet-5",
      "anthropic/claude-fable-5.1",
      "openai/gpt-6-astra",
      "x-ai/grok-4.7",
    ],
    embeddingModels: ["openai/text-embedding-3-small"],
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    languageModels: ["claude-sonnet-5", "claude-opus-5", "claude-fable-5-1", "claude-haiku-4-5"],
  },
  google: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    languageModels: ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
    embeddingModels: ["gemini-embedding-2", "gemini-embedding-001"],
  },
  xai: {
    baseUrl: "https://api.x.ai/v1",
    languageModels: ["grok-4.7"],
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    languageModels: ["deepseek-flash", "deepseek-v4-pro"],
  },
  typesafe: {
    baseUrl: "https://api.typesafe.ai/v1",
    decisionModels: ["jev-latest", "jev-1.13.0", "jev-preview"],
  },
  qwen: {
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    embeddingModels: ["text-embedding-v4", "text-embedding-v3"],
  },
  jina: {
    baseUrl: "https://api.jina.ai/v1",
    embeddingModels: [
      "jina-embeddings-v5-text-small",
      "jina-embeddings-v5-omni-small",
      "jina-embeddings-v4",
      "jina-embeddings-v3",
    ],
    rerankModels: ["jina-reranker-v3.5", "jina-reranker-v3", "jina-reranker-v2-base-multilingual"],
  },
  cohere: {
    baseUrl: "https://api.cohere.com/v2",
    embeddingModels: ["embed-v4.0", "embed-multilingual-v3.0"],
    rerankModels: ["rerank-v4.0-pro", "rerank-v3.5"],
  },
};

export function providerSupportsTask(
  provider: AIProviderValue,
  taskType: AITaskTypeValue
): boolean {
  return isProviderAllowedForTask(taskType, provider);
}

export function modelsForTask(
  provider: AIProviderValue,
  taskType: AITaskTypeValue
): string[] {
  const preset = PROVIDER_PRESETS[provider];
  if (!providerSupportsTask(provider, taskType)) return [];
  if (provider === "typesafe") return preset.decisionModels ?? [];
  if (taskType === "embedding") return preset.embeddingModels ?? [];
  if (taskType === "rerank") return preset.rerankModels ?? [];
  return preset.languageModels ?? [];
}

export function defaultModelForTask(
  provider: AIProviderValue,
  taskType: AITaskTypeValue
): string {
  return modelsForTask(provider, taskType)[0] ?? "";
}
