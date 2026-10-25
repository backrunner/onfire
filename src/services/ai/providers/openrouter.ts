import { OpenAIProvider } from "./openai";
import type { AIRerankOptions, AIRerankResult, ProviderConfig } from "./index";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { readResponseJson } from "@/lib/response-body";

/** OpenRouter exposes chat, embeddings and a Cohere-style rerank surface. */
export class OpenRouterProvider extends OpenAIProvider {
  name = "openrouter";
  private readonly rerankConfig: ProviderConfig;

  constructor(config: ProviderConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl || "https://openrouter.ai/api/v1",
      apiMode: config.apiMode === "responses" ? "chat" : config.apiMode,
    });
    this.rerankConfig = config;
  }

  async rerank(options: AIRerankOptions): Promise<AIRerankResult> {
    const config = this.rerankConfig;
    const baseUrl = (config.baseUrl || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
    const response = await fetchWithTimeout(`${baseUrl}/rerank`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      redirect: "manual",
      body: JSON.stringify({
        model: config.model,
        query: options.query,
        documents: options.documents,
        ...(options.topN !== undefined ? { top_n: options.topN } : {}),
      }),
    }, 30_000);
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`OpenRouter Rerank API error (HTTP ${response.status})`);
    }
    const data = await readResponseJson<{
      results?: Array<{ index: number; relevance_score: number; document?: { text?: string } }>;
      usage?: { total_tokens?: number };
    }>(response);
    if (!Array.isArray(data.results) || data.results.length === 0) {
      throw new Error("Invalid OpenRouter rerank response");
    }
    return {
      results: data.results.map((item) => ({
        index: item.index,
        relevanceScore: item.relevance_score,
        document: item.document?.text,
      })),
      usage: data.usage?.total_tokens !== undefined ? { totalTokens: data.usage.total_tokens } : undefined,
    };
  }
}
