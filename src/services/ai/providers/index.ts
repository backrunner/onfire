/**
 * AI Provider Interface and Factory
 */

import type { AIProvider as AIProviderType } from "@/drizzle/schema";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICompletionOptions {
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  /** Task-specific output validation, executed inside credential failover. */
  validateResult?: (result: AICompletionResult) => void;
}

export interface AICompletionResult {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIEmbeddingResult {
  embedding: number[];
  /** Identity of the coordinate space, supplied by the routed provider. */
  space?: string;
  usage?: {
    totalTokens: number;
  };
}

export interface AIRerankResult {
  results: Array<{ index: number; relevanceScore: number; document?: string }>;
  usage?: { totalTokens: number };
}

export interface AIRerankOptions {
  query: string;
  documents: string[];
  topN?: number;
}

export interface AIEmbeddingOptions {
  inputType?: "document" | "query";
}

export interface AIProvider {
  name: string;
  embeddingSpace?: string;
  complete(options: AICompletionOptions): Promise<AICompletionResult>;
  embed(text: string, options?: AIEmbeddingOptions): Promise<AIEmbeddingResult>;
  rerank?(options: AIRerankOptions): Promise<AIRerankResult>;
}

export interface ProviderConfig {
  provider: AIProviderType;
  model: string;
  apiKey: string;
  baseUrl?: string | null;
  apiMode?: "responses" | "chat";
  embeddingDimensions?: number;
}

/** Language tasks must never persist or present an empty model response. */
export function requireCompletionContent(
  content: string | null | undefined,
  provider: string
): string {
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error(`${provider} returned an empty completion`);
  }
  return content;
}

export async function createProvider(config: ProviderConfig): Promise<AIProvider> {
  switch (config.provider) {
    case "openai": {
      const { OpenAIProvider } = await import("./openai");
      return new OpenAIProvider(config);
    }
    case "openrouter": {
      const { OpenRouterProvider } = await import("./openrouter");
      return new OpenRouterProvider(config);
    }
    case "anthropic": {
      const { AnthropicProvider } = await import("./anthropic");
      return new AnthropicProvider(config);
    }
    case "google": {
      const { GoogleProvider } = await import("./google");
      return new GoogleProvider(config);
    }
    case "xai": {
      const { XAIProvider } = await import("./xai");
      return new XAIProvider(config);
    }
    case "deepseek": {
      const { DeepSeekProvider } = await import("./deepseek");
      return new DeepSeekProvider(config);
    }
    case "qwen": {
      const { QwenEmbeddingProvider } = await import("./qwen");
      return new QwenEmbeddingProvider(config);
    }
    case "jina": {
      const { JinaEmbeddingProvider } = await import("./jina");
      return new JinaEmbeddingProvider(config);
    }
    case "cohere": {
      const { CohereEmbeddingProvider } = await import("./cohere");
      return new CohereEmbeddingProvider(config);
    }
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}
