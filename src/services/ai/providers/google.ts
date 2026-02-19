/**
 * Google AI (Gemini) Provider
 */

import type {
  AIProvider,
  AICompletionOptions,
  AICompletionResult,
  AIEmbeddingResult,
  ProviderConfig,
} from "./index";

export class GoogleProvider implements AIProvider {
  name = "google";
  private config: ProviderConfig;
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResult> {
    const systemInstruction = options.messages.find((m) => m.role === "system");
    const contents = options.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const response = await fetch(
      `${this.baseUrl}/models/${this.config.model}:generateContent?key=${this.config.apiKey}`,
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
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google AI API error: ${error}`);
    }

    const data = (await response.json()) as {
      candidates: Array<{
        content: { parts: Array<{ text: string }> };
      }>;
      usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
      };
    };

    const text = data.candidates[0]?.content?.parts[0]?.text || "";

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

  async embed(text: string): Promise<AIEmbeddingResult> {
    const response = await fetch(
      `${this.baseUrl}/models/text-embedding-004:embedContent?key=${this.config.apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: { parts: [{ text }] },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google Embedding API error: ${error}`);
    }

    const data = (await response.json()) as {
      embedding: { values: number[] };
    };

    return {
      embedding: data.embedding?.values || [],
    };
  }
}
