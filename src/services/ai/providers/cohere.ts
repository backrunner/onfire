import type {
  AICompletionOptions,
  AICompletionResult,
  AIEmbeddingOptions,
  AIEmbeddingResult,
  AIProvider,
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
    throw new Error("Cohere is configured here as an embedding-only provider.");
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
}
