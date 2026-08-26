import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findCompatibleModel,
  listProviderModels,
  normalizeProviderModelId,
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
