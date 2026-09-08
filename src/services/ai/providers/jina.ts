import type {
  AICompletionOptions,
  AICompletionResult,
  AIEmbeddingOptions,
  AIEmbeddingResult,
  AIProvider,
  AIRerankOptions,
  AIRerankResult,
  ProviderConfig,
} from "./index";
import { EMBEDDING_DIMENSIONS } from "@/lib/ai-config";
import { readResponseJson, readResponseText } from "@/lib/response-body";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

export class JinaEmbeddingProvider implements AIProvider {
  name = "jina";
  private readonly baseUrl: string;

  constructor(private readonly config: ProviderConfig) {
    this.baseUrl = config.baseUrl || "https://api.jina.ai/v1";
  }

  async complete(_options: AICompletionOptions): Promise<AICompletionResult> {
    throw new Error("Jina is configured here as an embedding and rerank provider.");
  }

  async embed(
    text: string,
    options?: AIEmbeddingOptions
  ): Promise<AIEmbeddingResult> {
    const response = await fetchWithTimeout(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        input: [text],
        task: options?.inputType === "query" ? "retrieval.query" : "retrieval.passage",
        dimensions: this.config.embeddingDimensions ?? EMBEDDING_DIMENSIONS,
      }),
    }, 30_000);
    if (!response.ok) {
      throw new Error(`Jina Embedding API error: ${await readResponseText(response)}`);
    }
    const data = await readResponseJson<{
      data?: Array<{ embedding?: number[] }>;
      usage?: { total_tokens?: number };
    }>(response);
    return {
      embedding: data.data?.[0]?.embedding ?? [],
      usage: data.usage?.total_tokens
        ? { totalTokens: data.usage.total_tokens }
        : undefined,
    };
  }

  async rerank(options: AIRerankOptions): Promise<AIRerankResult> {
    const response = await fetchWithTimeout(`${this.baseUrl}/rerank`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        query: options.query,
        documents: options.documents,
        ...(options.topN ? { top_n: options.topN } : {}),
        return_documents: true,
      }),
    }, 30_000);
    if (!response.ok) {
      throw new Error(`Jina Rerank API error: ${await readResponseText(response)}`);
    }
    const data = await readResponseJson<{
      results?: Array<{ index: number; relevance_score: number; document?: string | { text?: string } }>;
      usage?: { total_tokens?: number };
    }>(response);
    return {
      results: (data.results ?? []).map((item) => ({
        index: item.index,
        relevanceScore: item.relevance_score,
        document: typeof item.document === "string" ? item.document : item.document?.text,
      })),
      usage: data.usage?.total_tokens ? { totalTokens: data.usage.total_tokens } : undefined,
    };
  }
}
