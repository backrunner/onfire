import type { AIModelKind, AIProviderValue } from "@/lib/ai-config";
import { classifyAIModel, safeAIBaseUrl } from "@/lib/ai-config";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { readResponseJson, readResponseText } from "@/lib/response-body";

export interface AIModelDescriptor {
  id: string;
  kind: AIModelKind;
  name?: string;
  contextLength?: number;
  /** The dimension OnFire will request/store. Undefined means incompatible or unknown. */
  dimensions?: number;
}

const DEFAULT_BASE_URLS: Record<AIProviderValue, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  xai: "https://api.x.ai/v1",
  deepseek: "https://api.deepseek.com",
  qwen: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  jina: "https://api.jina.ai/v1",
  cohere: "https://api.cohere.com/v2",
};

const STATIC_MODELS: Partial<Record<AIProviderValue, AIModelDescriptor[]>> = {
  openai: [
    { id: "text-embedding-3-small", kind: "embedding", dimensions: 1024 },
    { id: "text-embedding-3-large", kind: "embedding", dimensions: 1024 },
  ],
  openrouter: [
    { id: "openai/text-embedding-3-small", kind: "embedding", dimensions: 1024 },
    { id: "openai/text-embedding-3-large", kind: "embedding", dimensions: 1024 },
  ],
  google: [
    { id: "gemini-embedding-2", kind: "embedding", dimensions: 1024 },
    { id: "gemini-embedding-001", kind: "embedding", dimensions: 1024 },
  ],
  qwen: [
    { id: "text-embedding-v4", kind: "embedding", dimensions: 1024 },
    { id: "text-embedding-v3", kind: "embedding", dimensions: 1024 },
  ],
  jina: [
    { id: "jina-embeddings-v5-text-small", kind: "embedding", dimensions: 1024 },
    { id: "jina-embeddings-v5-omni-small", kind: "embedding", dimensions: 1024 },
    { id: "jina-embeddings-v4", kind: "embedding", dimensions: 1024 },
    { id: "jina-embeddings-v3", kind: "embedding", dimensions: 1024 },
    { id: "jina-reranker-v3", kind: "rerank" },
    { id: "jina-reranker-v3.5", kind: "rerank" },
    { id: "jina-reranker-v2-base-multilingual", kind: "rerank" },
  ],
  cohere: [
    { id: "embed-v4.0", kind: "embedding", dimensions: 1024 },
    { id: "embed-multilingual-v3.0", kind: "embedding", dimensions: 1024 },
    { id: "rerank-v4.0-pro", kind: "rerank" },
    { id: "rerank-v3.5", kind: "rerank" },
  ],
};

const STATIC_ONLY_PROVIDERS = new Set<AIProviderValue>(["cohere"]);

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function normalizeProviderModelId(
  provider: AIProviderValue,
  modelId: string,
): string {
  const withoutGooglePrefix = provider === "google"
    ? modelId.replace(/^models\//, "")
    : modelId;
  return provider === "jina"
    ? withoutGooglePrefix.replace(/^jina-ai\//, "")
    : withoutGooglePrefix;
}

function numericDimensions(value: Record<string, unknown>): number[] {
  const direct = [
    value.dimensions,
    value.embedding_dimensions,
    value.output_dimension,
    value.outputDimensionality,
  ].filter((entry): entry is number => typeof entry === "number" && Number.isInteger(entry) && entry > 0);
  const description = String(value.description ?? "");
  const described = Array.from(
    description.matchAll(/(?:^|\D)(\d{3,5})[- ]?(?:dimensional|dimensions?)/gi),
    (match) => Number(match[1]),
  );
  const listed = Array.from(
    description.matchAll(/embeddings?\s+(?:at|in)\s+([\d, and]+)(?:\.{3}|\s+dimensions?)/gi),
  ).flatMap((match) => Array.from(match[1].matchAll(/\d{3,5}/g), (value) => Number(value[0])));
  return [...new Set([...direct, ...described, ...listed])];
}

function supportsOnFireDimensions(
  provider: AIProviderValue,
  id: string,
  value: Record<string, unknown>,
): boolean {
  const dimensions = numericDimensions(value);
  if (dimensions.includes(1024)) return true;
  if (dimensions.length > 0) return false;
  return (
    (provider === "openai" || provider === "openrouter") && /text-embedding-3-(?:small|large)$/i.test(id)
  ) || (
    provider === "google" && /^gemini-embedding-(?:001|2)$/i.test(id)
  ) || (
    provider === "qwen" && /^text-embedding-v[34]$/i.test(id)
  );
}

function normalizeModels(
  provider: AIProviderValue,
  items: unknown[],
  forcedKind?: AIModelKind,
): AIModelDescriptor[] {
  const result: AIModelDescriptor[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const value = item as Record<string, unknown>;
    const rawId = typeof value.id === "string" ? value.id : typeof value.name === "string" ? value.name : "";
    const id = normalizeProviderModelId(provider, rawId);
    if (!id) continue;
    const architecture = value.architecture && typeof value.architecture === "object"
      ? value.architecture as Record<string, unknown>
      : undefined;
    const capabilities = [
      value.type,
      value.task,
      ...(Array.isArray(value.capabilities) ? value.capabilities : []),
      ...(Array.isArray(value.endpoints) ? value.endpoints : []),
      ...(Array.isArray(value.supportedGenerationMethods) ? value.supportedGenerationMethods : []),
      architecture?.modality,
      ...(Array.isArray(architecture?.input_modalities) ? architecture.input_modalities : []),
      ...(Array.isArray(architecture?.output_modalities) ? architecture.output_modalities : []),
    ].filter((entry): entry is string => typeof entry === "string").join(" ").toLowerCase();
    const detectedKind = /rerank|ranker|cross[-_ ]?encoder/.test(capabilities)
      ? "rerank"
      : /embed|embedding/.test(capabilities)
        ? "embedding"
        : undefined;
    const kind = detectedKind ?? forcedKind ?? classifyAIModel(id);
    result.push({
      id,
      kind,
      name: typeof value.displayName === "string"
        ? value.displayName
        : typeof value.name === "string" && value.name !== rawId
          ? value.name
          : undefined,
      contextLength: typeof value.context_length === "number" ? value.context_length : undefined,
      dimensions: kind === "embedding" && supportsOnFireDimensions(provider, id, value)
        ? 1024
        : undefined,
    });
  }
  return result;
}

async function fetchCatalogPage(url: string, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers,
    redirect: "error",
  }, 15_000);
  if (!response.ok) {
    throw new Error(`Model catalog request failed: ${await readResponseText(response)}`);
  }
  const data = await readResponseJson<unknown>(response);
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  return data as Record<string, unknown>;
}

async function listAnthropicModels(baseUrl: string, apiKey: string): Promise<AIModelDescriptor[]> {
  const models: AIModelDescriptor[] = [];
  let afterId: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(endpoint(baseUrl, "models"));
    url.searchParams.set("limit", "100");
    if (afterId) url.searchParams.set("after_id", afterId);
    const body = await fetchCatalogPage(url.toString(), {
      Accept: "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    });
    if (Array.isArray(body.data)) models.push(...normalizeModels("anthropic", body.data, "text"));
    if (body.has_more !== true || typeof body.last_id !== "string") break;
    afterId = body.last_id;
  }
  return models;
}

async function listGoogleModels(baseUrl: string, apiKey: string): Promise<AIModelDescriptor[]> {
  const models: AIModelDescriptor[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(endpoint(baseUrl, "models"));
    url.searchParams.set("key", apiKey);
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const body = await fetchCatalogPage(url.toString(), { Accept: "application/json" });
    if (Array.isArray(body.models)) models.push(...normalizeModels("google", body.models));
    if (typeof body.nextPageToken !== "string" || !body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return models;
}

async function listOpenAiCompatibleModels(
  provider: AIProviderValue,
  baseUrl: string,
  apiKey: string,
): Promise<AIModelDescriptor[]> {
  const paths: Array<{ path: string; kind?: AIModelKind }> = provider === "openrouter"
    ? [{ path: "models", kind: "text" }, { path: "embeddings/models", kind: "embedding" }]
    : [{ path: "models" }];
  const models: AIModelDescriptor[] = [];
  for (const item of paths) {
    const body = await fetchCatalogPage(endpoint(baseUrl, item.path), {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    });
    if (Array.isArray(body.data)) models.push(...normalizeModels(provider, body.data, item.kind));
    if (Array.isArray(body.models)) models.push(...normalizeModels(provider, body.models, item.kind));
  }
  return models;
}

export async function listProviderModels(
  provider: AIProviderValue,
  apiKey: string,
  configuredBaseUrl?: string | null,
): Promise<AIModelDescriptor[]> {
  if (!configuredBaseUrl && STATIC_ONLY_PROVIDERS.has(provider)) {
    return STATIC_MODELS[provider] ?? [];
  }
  const baseUrl = configuredBaseUrl === undefined || configuredBaseUrl === null || configuredBaseUrl.trim() === ""
    ? DEFAULT_BASE_URLS[provider]
    : safeAIBaseUrl(configuredBaseUrl);
  if (!baseUrl) throw new Error("AI base URL is unsafe or invalid");
  const models = provider === "anthropic"
    ? await listAnthropicModels(baseUrl, apiKey)
    : provider === "google"
      ? await listGoogleModels(baseUrl, apiKey)
      : await listOpenAiCompatibleModels(provider, baseUrl, apiKey);
  // Live catalogs are authoritative for server-side route validation. Static
  // entries enrich matching live records for providers whose catalog omits
  // dimension metadata, but must never make an unlisted model assignable.
  const staticModels = STATIC_MODELS[provider] ?? [];
  return models.reduce<AIModelDescriptor[]>((result, model) => {
    const metadata = staticModels.find(
      (item) => item.id === model.id && item.kind === model.kind,
    );
    const enriched = metadata && model.dimensions === undefined
      ? { ...model, dimensions: metadata.dimensions }
      : model;
    const existing = result.find(
      (item) => item.id === enriched.id && item.kind === enriched.kind,
    );
    if (!existing) result.push(enriched);
    else if (existing.dimensions === undefined && enriched.dimensions !== undefined) {
      existing.dimensions = enriched.dimensions;
    }
    return result;
  }, []);
}

export function findCompatibleModel(
  models: readonly AIModelDescriptor[],
  modelId: string,
  expectedKind: AIModelKind,
): AIModelDescriptor | null {
  const match = models.find((model) => model.id === modelId && model.kind === expectedKind);
  if (!match) return null;
  if (expectedKind === "embedding" && match.dimensions !== 1024) return null;
  return match;
}
