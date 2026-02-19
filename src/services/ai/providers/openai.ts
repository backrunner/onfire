/**
 * OpenAI Provider
 */

import type {
  AIProvider,
  AICompletionOptions,
  AICompletionResult,
  AIEmbeddingResult,
  ProviderConfig,
} from "./index";

export class OpenAIProvider implements AIProvider {
  name = "openai";
  private config: ProviderConfig;
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || "https://api.openai.com/v1";
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2048,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    return {
      content: data.choices[0]?.message?.content || "",
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }

  async embed(text: string): Promise<AIEmbeddingResult> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI Embedding API error: ${error}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
      usage?: { total_tokens: number };
    };

    return {
      embedding: data.data[0]?.embedding || [],
      usage: data.usage
        ? { totalTokens: data.usage.total_tokens }
        : undefined,
    };
  }
}
