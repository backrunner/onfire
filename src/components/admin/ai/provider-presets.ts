import {
  EMBEDDING_AI_PROVIDERS,
  LANGUAGE_AI_PROVIDERS,
  type AIProviderValue,
  type AITaskTypeValue,
} from "@/lib/ai-config";

interface ProviderPreset {
  baseUrl: string;
  languageModels?: string[];
  embeddingModels?: string[];
}

export const PROVIDER_PRESETS: Record<AIProviderValue, ProviderPreset> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    languageModels: ["gpt-5.4-mini", "gpt-4.1-mini"],
    embeddingModels: ["text-embedding-3-small", "text-embedding-3-large"],
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    languageModels: ["claude-sonnet-4-5", "claude-haiku-4-5"],
  },
  google: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    languageModels: ["gemini-2.5-flash"],
    embeddingModels: ["gemini-embedding-2", "gemini-embedding-001"],
  },
  xai: {
    baseUrl: "https://api.x.ai/v1",
    languageModels: ["grok-4-fast"],
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    languageModels: ["deepseek-chat"],
  },
  qwen: {
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    embeddingModels: ["text-embedding-v4", "text-embedding-v3"],
  },
  jina: {
    baseUrl: "https://api.jina.ai/v1",
    embeddingModels: [
      "jina-embeddings-v5",
      "jina-embeddings-v4",
      "jina-embeddings-v3",
    ],
  },
  cohere: {
    baseUrl: "https://api.cohere.com/v2",
    embeddingModels: ["embed-v4.0", "embed-multilingual-v3.0"],
  },
};

export function providerSupportsTask(
  provider: AIProviderValue,
  taskType: AITaskTypeValue
): boolean {
  const providers =
    taskType === "embedding"
      ? EMBEDDING_AI_PROVIDERS
      : LANGUAGE_AI_PROVIDERS;
  return providers.some((value) => value === provider);
}

export function modelsForTask(
  provider: AIProviderValue,
  taskType: AITaskTypeValue
): string[] {
  const preset = PROVIDER_PRESETS[provider];
  return taskType === "embedding"
    ? preset.embeddingModels ?? []
    : preset.languageModels ?? [];
}

export function defaultModelForTask(
  provider: AIProviderValue,
  taskType: AITaskTypeValue
): string {
  return modelsForTask(provider, taskType)[0] ?? "";
}
