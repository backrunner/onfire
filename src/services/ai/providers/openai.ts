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
import { requireCompletionContent } from "./index";
import { EMBEDDING_DIMENSIONS } from "@/lib/ai-config";
import { readResponseJson, readResponseText } from "@/lib/response-body";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

export class OpenAIProvider implements AIProvider {
  name = "openai";
  private config: ProviderConfig;
  private baseUrl: string;
  private readonly isOfficialEndpoint: boolean;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.baseUrl = (config.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
    this.isOfficialEndpoint = this.baseUrl === "https://api.openai.com/v1";
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    if (this.config.apiMode === "chat") {
      return this.completeWithChat(options);
    }
    return this.completeWithResponses(options);
  }

  private async completeWithResponses(
    options: AICompletionOptions
  ): Promise<AICompletionResult> {
    const response = await fetchWithTimeout(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        input: options.messages,
        max_output_tokens: options.maxTokens ?? 2048,
        // OpenAI supports `store:false`; compatible gateways often reject the
        // provider-specific field, so only send it to the official endpoint.
        ...(this.isOfficialEndpoint ? { store: false } : {}),
      }),
    }, 30_000);

    if (!response.ok) {
      const error = await readResponseText(response);
      throw new Error(`OpenAI Responses API error: ${error}`);
    }

    const data = await readResponseJson<{
      output?: Array<{
        type: string;
        content?: Array<{ type: string; text?: string }>;
      }>;
      output_text?: string;
      status?: string;
      error?: { message?: string } | null;
      incomplete_details?: { reason?: string } | null;
      usage?: {
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
      };
    }>(response);
    const content =
      data.output_text ??
      data.output
        ?.flatMap((item) => item.content ?? [])
        .filter((item) => item.type === "output_text")
        .map((item) => item.text ?? "")
        .join("") ??
      "";
    if (!content && data.status !== "completed") {
      throw new Error(
        data.error?.message ||
          data.incomplete_details?.reason ||
          "OpenAI response did not complete"
      );
    }

    return {
      content: requireCompletionContent(content, "OpenAI Responses API"),
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }

  private async completeWithChat(
    options: AICompletionOptions
  ): Promise<AICompletionResult> {
    const response = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: options.messages,
        ...(this.baseUrl === "https://api.openai.com/v1"
          ? { max_completion_tokens: options.maxTokens ?? 2048 }
          : { max_tokens: options.maxTokens ?? 2048 }),
        ...(!/^(gpt-5|o\d)/i.test(this.config.model)
          ? { temperature: options.temperature ?? 0.7 }
          : {}),
        ...(this.isOfficialEndpoint ? { store: false } : {}),
      }),
    }, 30_000);

    if (!response.ok) {
      const error = await readResponseText(response);
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await readResponseJson<{
      choices: Array<{ message: { content: string } }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    }>(response);

    const content = requireCompletionContent(
      data.choices[0]?.message?.content,
      "OpenAI Chat Completions API"
    );

    return {
      content,
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
    const response = await fetchWithTimeout(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        input: text,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    }, 30_000);

    if (!response.ok) {
      const error = await readResponseText(response);
      throw new Error(`OpenAI Embedding API error: ${error}`);
    }

    const data = await readResponseJson<{
      data: Array<{ embedding: number[] }>;
      usage?: { total_tokens: number };
    }>(response);

    return {
      embedding: data.data[0]?.embedding || [],
      usage: data.usage
        ? { totalTokens: data.usage.total_tokens }
        : undefined,
    };
  }
}
