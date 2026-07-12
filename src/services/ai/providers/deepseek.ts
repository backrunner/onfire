/**
 * DeepSeek Provider - OpenAI-compatible API
 */

import type {
  AIProvider,
  AICompletionOptions,
  AICompletionResult,
  AIEmbeddingResult,
  ProviderConfig,
} from "./index";
import { requireCompletionContent } from "./index";
import { readResponseJson, readResponseText } from "@/lib/response-body";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

export class DeepSeekProvider implements AIProvider {
  name = "deepseek";
  private config: ProviderConfig;
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || "https://api.deepseek.com/v1";
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const response = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
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
    }, 30_000);

    if (!response.ok) {
      const error = await readResponseText(response);
      throw new Error(`DeepSeek API error: ${error}`);
    }

    const data = await readResponseJson<{
      choices: Array<{ message: { content: string } }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    }>(response);

    return {
      content: requireCompletionContent(
        data.choices[0]?.message?.content,
        "DeepSeek API"
      ),
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }

  async embed(_text: string): Promise<AIEmbeddingResult> {
    throw new Error("DeepSeek does not support embeddings. Use OpenAI or another provider.");
  }
}
