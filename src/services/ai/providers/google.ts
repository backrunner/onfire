/**
 * Google AI (Gemini) Provider
 */

import type {
  AIProvider,
  AICompletionOptions,
  AICompletionResult,
  AIEmbeddingOptions,
  AIEmbeddingResult,
  ProviderConfig,
} from "./index";
import { requireCompletionContent } from "./index";
import { EMBEDDING_DIMENSIONS } from "@/lib/ai-config";
import { readResponseJson, readResponseText } from "@/lib/response-body";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

export class GoogleProvider implements AIProvider {
  name = "google";
  private config: ProviderConfig;
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
  }

  private modelId(): string {
    return this.config.model.replace(/^models\//, "");
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const systemInstruction = options.messages.find((m) => m.role === "system");
    const contents = options.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const response = await fetchWithTimeout(
      `${this.baseUrl}/models/${this.modelId()}:generateContent?key=${this.config.apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents,
          systemInstruction: systemInstruction
            ? { parts: [{ text: systemInstruction.content }] }
            : undefined,
          generationConfig: {
            temperature: options.temperature ?? 0.7,
            maxOutputTokens: options.maxTokens ?? 2048,
          },
        }),
      },
      30_000
    );

    if (!response.ok) {
      const error = await readResponseText(response);
      throw new Error(`Google AI API error: ${error}`);
    }

    const data = await readResponseJson<{
      candidates: Array<{
        content: { parts: Array<{ text: string }> };
      }>;
      usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
      };
    }>(response);

    const text = requireCompletionContent(
      data.candidates[0]?.content?.parts
        ?.filter((part) => typeof part.text === "string")
        .map((part) => part.text)
        .join(""),
      "Google AI API"
    );

    return {
      content: text,
      usage: data.usageMetadata
        ? {
            promptTokens: data.usageMetadata.promptTokenCount,
            completionTokens: data.usageMetadata.candidatesTokenCount,
            totalTokens: data.usageMetadata.totalTokenCount,
          }
        : undefined,
    };
  }

  async embed(
    text: string,
    options?: AIEmbeddingOptions
  ): Promise<AIEmbeddingResult> {
    const response = await fetchWithTimeout(
      `${this.baseUrl}/models/${this.modelId()}:embedContent?key=${this.config.apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: { parts: [{ text }] },
          taskType:
            options?.inputType === "query"
              ? "RETRIEVAL_QUERY"
              : "RETRIEVAL_DOCUMENT",
          outputDimensionality: this.config.embeddingDimensions ?? EMBEDDING_DIMENSIONS,
        }),
      },
      30_000
    );

    if (!response.ok) {
      const error = await readResponseText(response);
      throw new Error(`Google Embedding API error: ${error}`);
    }

    const data = await readResponseJson<{
      embedding: { values: number[] };
    }>(response);

    return {
      embedding: data.embedding?.values || [],
    };
  }
}
