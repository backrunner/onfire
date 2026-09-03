import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findCompatibleModel,
  listProviderModels,
  normalizeProviderModelId,
  resolveAssignableModel,
} from "./model-catalog";

afterEach(() => vi.restoreAllMocks());

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("AI model catalog", () => {
  it("combines OpenRouter text and embedding catalogs", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      return url.endsWith("/embeddings/models")
        ? json({ data: [{
            id: "voyageai/voyage-code-4",
            description: "Matryoshka embeddings at 2048, 1024, 512, and 256...",
            architecture: { modality: "text->embeddings" },
          }] })
        : json({ data: [{ id: "vendor/chat", architecture: { modality: "text->text" } }] });
    });

    const models = await listProviderModels("openrouter", "secret");
    expect(models).toEqual(expect.arrayContaining([
      { id: "vendor/chat", kind: "text", name: undefined, contextLength: undefined, dimensions: undefined },
      { id: "voyageai/voyage-code-4", kind: "embedding", name: undefined, contextLength: undefined, dimensions: 1024 },
    ]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://openrouter.ai/api/v1/models",
      "https://openrouter.ai/api/v1/embeddings/models",
    ]);
  });

  it("uses Anthropic API-key headers and follows cursor pagination", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ data: [{ id: "claude-first" }], has_more: true, last_id: "first" }))
      .mockResolvedValueOnce(json({ data: [{ id: "claude-second" }], has_more: false }));

    const models = await listProviderModels("anthropic", "secret");
    expect(models.map((model) => model.id)).toEqual(["claude-first", "claude-second"]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("after_id=first");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        "x-api-key": "secret",
        "anthropic-version": "2023-06-01",
      }),
      redirect: "error",
    });
  });

  it("normalizes Google model names and generation methods", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({
      models: [
        { name: "models/gemini-flash", displayName: "Gemini Flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] },
      ],
    }));
    const models = await listProviderModels("google", "secret");
    expect(models).toEqual(expect.arrayContaining([
      { id: "gemini-flash", kind: "text", name: "Gemini Flash", contextLength: undefined, dimensions: undefined },
      { id: "gemini-embedding-001", kind: "embedding", name: undefined, contextLength: undefined, dimensions: 1024 },
    ]));
  });

  it("normalizes legacy provider model prefixes", () => {
    expect(normalizeProviderModelId("google", "models/gemini-flash"))
      .toBe("gemini-flash");
    expect(normalizeProviderModelId("jina", "jina-ai/jina-embeddings-v4"))
      .toBe("jina-embeddings-v4");
    expect(normalizeProviderModelId("openrouter", "openai/gpt-4o-mini"))
      .toBe("openai/gpt-4o-mini");
  });

  it("normalizes Jina catalog ids and enriches known dimensions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ data: [
      { id: "jina-ai/jina-reranker-v3" },
      { id: "jina-ai/jina-embeddings-v4", output_modalities: ["embeddings"] },
    ] }));
    const models = await listProviderModels("jina", "secret");
    expect(models).toContainEqual({ id: "jina-reranker-v3", kind: "rerank" });
    expect(models).toContainEqual(expect.objectContaining({
      id: "jina-embeddings-v4",
      kind: "embedding",
      dimensions: 1024,
    }));
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects unknown capabilities and non-1024 embeddings", () => {
    const models = [
      { id: "chat", kind: "text" as const },
      { id: "fixed-embed", kind: "embedding" as const, dimensions: 768 },
    ];
    expect(findCompatibleModel(models, "chat", "text")).toEqual(models[0]);
    expect(findCompatibleModel(models, "chat", "embedding")).toBeNull();
    expect(findCompatibleModel(models, "fixed-embed", "embedding")).toBeNull();
  });

  it("rejects an unsafe configured base URL instead of falling back to the provider", async () => {
    await expect(listProviderModels("openai", "secret", "http://localhost/v1"))
      .rejects.toThrow(/unsafe|invalid/i);
  });

  it("does not assume every unknown Google embedding is 1024-dimensional", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({
      models: [{
        name: "models/embedding-future",
        supportedGenerationMethods: ["embedContent"],
      }],
    }));
    const models = await listProviderModels("google", "secret");
    expect(findCompatibleModel(models, "embedding-future", "embedding")).toBeNull();
  });

  it("does not make static suggestions assignable when a live catalog omits them", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ data: [{ id: "listed-chat" }] }));
    const models = await listProviderModels("openai", "secret");
    expect(models.map((model) => model.id)).toEqual(["listed-chat"]);
    expect(findCompatibleModel(models, "text-embedding-3-small", "embedding")).toBeNull();
  });

  it("lets explicit capabilities override an endpoint's default kind", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith("/embeddings/models")
        ? json({ data: [] })
        : json({ data: [
            { id: "opaque-embedding", architecture: { modality: "text->embeddings" } },
          ] }),
    );
    const models = await listProviderModels("openrouter", "secret");
    expect(models).toContainEqual(expect.objectContaining({
      id: "opaque-embedding",
      kind: "embedding",
    }));
  });
});

describe("resolveAssignableModel", () => {
  const catalog = [
    { id: "listed-chat", kind: "text" as const },
    { id: "listed-embed", kind: "embedding" as const, dimensions: 1024 },
  ];

  it("prefers server-verified catalog metadata", () => {
    expect(resolveAssignableModel("openai", catalog, "listed-chat", "text"))
      .toEqual({ id: "listed-chat", kind: "text" });
    expect(resolveAssignableModel("openai", catalog, "listed-embed", "embedding"))
      .toEqual({ id: "listed-embed", kind: "embedding", dimensions: 1024 });
    expect(resolveAssignableModel("openai", catalog, "listed-chat", "embedding")).toBeNull();
  });

  it("accepts unlisted models whose names classify to the task kind", () => {
    expect(resolveAssignableModel("openai", [], "gpt-5-custom", "text"))
      .toEqual({ id: "gpt-5-custom", kind: "text", dimensions: undefined });
    expect(resolveAssignableModel("openai", [], "my-embedding-model", "embedding"))
      .toEqual({ id: "my-embedding-model", kind: "embedding", dimensions: 1024 });
    expect(resolveAssignableModel("jina", [], "bge-reranker-v2", "rerank"))
      .toEqual({ id: "bge-reranker-v2", kind: "rerank", dimensions: undefined });
  });

  it("rejects unlisted models whose names classify to a different kind", () => {
    expect(resolveAssignableModel("jina", [], "jina-reranker-v9", "text")).toBeNull();
    expect(resolveAssignableModel("openai", [], "gpt-5-custom", "rerank")).toBeNull();
    expect(resolveAssignableModel("openai", [], "my-embedding-model", "text")).toBeNull();
  });

  it("normalizes provider prefixes and trims before classifying", () => {
    expect(resolveAssignableModel("google", [], " models/gemini-3-custom ", "text"))
      .toEqual({ id: "gemini-3-custom", kind: "text", dimensions: undefined });
    expect(resolveAssignableModel("jina", [], "jina-ai/custom-embedder", "embedding"))
      .toEqual({ id: "custom-embedder", kind: "embedding", dimensions: 1024 });
    expect(resolveAssignableModel("openai", [], "   ", "text")).toBeNull();
  });

  it("still rejects catalog embeddings that cannot produce 1024 dimensions", () => {
    const fixed = [{ id: "fixed-embed", kind: "embedding" as const, dimensions: 768 }];
    expect(resolveAssignableModel("openai", fixed, "fixed-embed", "embedding")).toBeNull();
  });

  it("does not let the name fallback override a catalog-listed kind", () => {
    const listed = [{ id: "my-embedding-model", kind: "text" as const }];
    expect(resolveAssignableModel("openai", listed, "my-embedding-model", "embedding")).toBeNull();
    expect(resolveAssignableModel("openai", listed, "my-embedding-model", "text"))
      .toEqual({ id: "my-embedding-model", kind: "text" });
  });
});
