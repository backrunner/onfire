import { z } from "zod";
import { safeAIBaseUrl } from "@/lib/ai-config";
import { readResponseJson } from "@/lib/response-body";
import type { AIProvider, ProviderConfig, AISpamOptions, AISpamResult, AICompletionResult, AIEmbeddingResult } from "./index";

const probability = z.number().min(0).max(1);
const resultSchema = z.object({
  model: z.string().trim().min(1).max(200),
  spamProbability: probability,
  supportProbability: probability,
  usage: z.object({
    promptTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    completionTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    totalTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }).optional(),
}).strict();
const labelsSchema = z.array(z.object({ label: z.string().min(1).max(200), score: probability })).min(2).max(256);

/** Keep the entire message or fail; truncation could remove decisive evidence. */
export function requireSpamRequestBudget(value: unknown): string {
  const body = JSON.stringify(value);
  if (new TextEncoder().encode(body).length > 24_000) throw new Error("Spam decision input exceeds the request budget");
  return body;
}

/** No redirects, bounded body and time, and no upstream diagnostics in stored health. */
export async function requestSpamDecision(url: string, apiKey: string, body: string, timeoutMs: number): Promise<unknown> {
  if (!safeAIBaseUrl(url)) throw new Error("Unsafe spam decision endpoint");
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body, redirect: "manual", signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Spam decision failed (HTTP ${response.status})`);
    }
    if (!response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      await response.body?.cancel();
      throw new Error("Spam decision must return JSON");
    }
    return await readResponseJson<unknown>(response, 64 * 1024);
  } catch (error) {
    if (error instanceof Error && /^(Spam decision failed \(HTTP \d+\)|Spam decision must return JSON)$/.test(error.message)) throw error;
    throw new Error("Spam decision request failed, timed out or returned invalid JSON");
  }
}

export class SpamDecisionProvider implements AIProvider {
  name: string;
  private readonly endpoint: string;
  constructor(private readonly config: ProviderConfig) {
    this.name = config.provider;
    const configured = config.baseUrl ? safeAIBaseUrl(config.baseUrl) : null;
    if (config.baseUrl && !configured) throw new Error("Unsafe spam decision endpoint");
    if (config.provider === "decision" && !configured) throw new Error("A decision endpoint is required");
    if (config.provider === "huggingface" && !/^[\w.-]+\/[\w.-]+$/.test(config.model)) {
      throw new Error("Hugging Face model must be an owner/model ID");
    }
    if (config.provider === "huggingface" && !config.spamLabel?.trim()) throw new Error("An explicit spam label is required");
    if (config.provider === "huggingface" && (!config.supportLabel?.trim() || config.supportLabel === config.spamLabel)) throw new Error("A distinct genuine-support label is required");
    this.endpoint = configured ?? `https://router.huggingface.co/hf-inference/models/${config.model}`;
  }
  async complete(): Promise<AICompletionResult> { throw new Error("Decision models do not generate text"); }
  async embed(): Promise<AIEmbeddingResult> { throw new Error("Decision models do not generate embeddings"); }

  async checkSpam(options: AISpamOptions): Promise<AISpamResult> {
    if (this.config.provider === "huggingface") {
      const body = requireSpamRequestBudget({
        inputs: JSON.stringify(options.message),
        parameters: { function_to_apply: "softmax", top_k: 256 },
      });
      const payload = await requestSpamDecision(this.endpoint, this.config.apiKey, body, options.timeoutMs);
      // Inference API returns a flat list; Transformers endpoints may wrap one input.
      const parsed = labelsSchema.safeParse(Array.isArray(payload) && payload.length === 1 && Array.isArray(payload[0]) ? payload[0] : payload);
      if (!parsed.success) throw new Error("Invalid classification probabilities");
      const labels = parsed.data;
      if (new Set(labels.map((item) => item.label)).size !== labels.length ||
          Math.abs(labels.reduce((sum, item) => sum + item.score, 0) - 1) > 0.01) {
        throw new Error("Invalid classification distribution");
      }
      // Explicit mapping: LABEL_1 is not universally spam and must never be guessed.
      const spam = labels.find((item) => item.label === this.config.spamLabel);
      const support = labels.find((item) => item.label === this.config.supportLabel);
      if (!spam || !support) throw new Error("Configured spam or genuine-support label is missing from classification response");
      return { spamProbability: spam.score, supportProbability: support.score, provider: "huggingface", model: this.config.model };
    }
    const body = requireSpamRequestBudget({ protocol: "onfire-decision-v1", model: this.config.model, message: options.message });
    const parsed = resultSchema.safeParse(await requestSpamDecision(this.endpoint, this.config.apiKey, body, options.timeoutMs));
    if (!parsed.success) throw new Error("Invalid spam decision response");
    return { ...parsed.data, provider: "decision" };
  }
}
