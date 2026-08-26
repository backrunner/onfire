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

export class CohereEmbeddingProvider implements AIProvider {
  name = "cohere";
  private readonly baseUrl: string;

  constructor(private readonly config: ProviderConfig) {
    this.baseUrl = config.baseUrl || "https://api.cohere.com/v2";
  }

  async complete(_options: AICompletionOptions): Promise<AICompletionResult> {
    throw new Error("Cohere is configured here as an embedding and rerank provider.");
  }

  async embed(
    text: string,
    options?: AIEmbeddingOptions
  ): Promise<AIEmbeddingResult> {
    const response = await fetchWithTimeout(`${this.baseUrl}/embed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        texts: [text],
        input_type:
          options?.inputType === "query" ? "search_query" : "search_document",
        embedding_types: ["float"],
        ...(this.config.model.startsWith("embed-v4")
          ? { output_dimension: EMBEDDING_DIMENSIONS }
          : {}),
      }),
    }, 30_000);
    if (!response.ok) {
      throw new Error(`Cohere Embed API error: ${await readResponseText(response)}`);
    }
    const data = await readResponseJson<{
      embeddings?: { float?: number[][] };
      meta?: { billed_units?: { input_tokens?: number } };
    }>(response);
    const totalTokens = data.meta?.billed_units?.input_tokens;
    return {
      embedding: data.embeddings?.float?.[0] ?? [],
      usage: totalTokens ? { totalTokens } : undefined,
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
      throw new Error(`Cohere Rerank API error: ${await readResponseText(response)}`);
    }
    const data = await readResponseJson<{
      results?: Array<{ index: number; relevance_score: number; document?: string | { text?: string } }>;
      meta?: { billed_units?: { search_units?: number } };
    }>(response);
    return {
      results: (data.results ?? []).map((item) => ({
        index: item.index,
        relevanceScore: item.relevance_score,
        document: typeof item.document === "string" ? item.document : item.document?.text,
      })),
      // Cohere reports search units here, not tokens. The shared usage ledger
      // records the request with zero tokens instead of corrupting token totals.
    };
  }
}
