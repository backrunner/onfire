/**
 * Anthropic Provider
 */

import type {
  AIProvider,
  AICompletionOptions,
  AICompletionResult,
  AIEmbeddingResult,
  ProviderConfig,
} from "./index";

export class AnthropicProvider implements AIProvider {
  name = "anthropic";
  private config: ProviderConfig;
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || "https://api.anthropic.com/v1";
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const systemMessage = options.messages.find((m) => m.role === "system");
    const otherMessages = options.messages.filter((m) => m.role !== "system");

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: options.maxTokens ?? 2048,
        system: systemMessage?.content,
        messages: otherMessages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
      usage?: {
        input_tokens: number;
        output_tokens: number;
      };
    };

    const textContent = data.content.find((c) => c.type === "text");

    return {
      content: textContent?.text || "",
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: data.usage.input_tokens + data.usage.output_tokens,
          }
        : undefined,
    };
  }

  async embed(_text: string): Promise<AIEmbeddingResult> {
    throw new Error("Anthropic does not support embeddings. Use OpenAI or another provider.");
  }
}
