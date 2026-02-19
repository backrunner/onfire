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
  usage?: {
    totalTokens: number;
  };
}

export interface AIProvider {
  name: string;
  complete(options: AICompletionOptions): Promise<AICompletionResult>;
  embed(text: string): Promise<AIEmbeddingResult>;
}

export interface ProviderConfig {
  provider: AIProviderType;
  model: string;
  apiKey: string;
  baseUrl?: string | null;
}

export async function createProvider(config: ProviderConfig): Promise<AIProvider> {
  switch (config.provider) {
    case "openai": {
      const { OpenAIProvider } = await import("./openai");
      return new OpenAIProvider(config);
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
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}
