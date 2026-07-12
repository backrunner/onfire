import { afterEach, describe, expect, it, vi } from "vitest";
import { EMBEDDING_DIMENSIONS } from "@/lib/ai-config";
import { OpenAIProvider } from "./openai";
import { QwenEmbeddingProvider } from "./qwen";
import { JinaEmbeddingProvider } from "./jina";
import { CohereEmbeddingProvider } from "./cohere";
import { GoogleProvider } from "./google";
import { AnthropicProvider } from "./anthropic";
import { DeepSeekProvider } from "./deepseek";
import { XAIProvider } from "./xai";

afterEach(() => vi.restoreAllMocks());

function mockJson(body: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
}

describe("AI provider protocols", () => {
  it("uses the OpenAI Responses API when configured", async () => {
    const fetchMock = mockJson({
      output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }],
      usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 },
    });
    const provider = new OpenAIProvider({
      provider: "openai",
      model: "gpt-5.4-mini",
      apiKey: "test",
      apiMode: "responses",
    });

    await expect(
      provider.complete({ messages: [{ role: "user", content: "hello" }] })
    ).resolves.toMatchObject({ content: "ok" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/responses");
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.store).toBe(false);
  });

  it("uses Chat Completions when configured", async () => {
    const fetchMock = mockJson({ choices: [{ message: { content: "ok" } }] });
    const provider = new OpenAIProvider({
      provider: "openai",
      model: "gpt-4.1-mini",
      apiKey: "test",
      apiMode: "chat",
    });

    await provider.complete({ messages: [{ role: "user", content: "hello" }] });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.openai.com/v1/chat/completions"
    );
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request).toMatchObject({ store: false, max_completion_tokens: 2048 });
    expect(request).not.toHaveProperty("max_tokens");
  });

  it("omits OpenAI-only store fields for compatible gateways", async () => {
    const fetchMock = mockJson({ choices: [{ message: { content: "ok" } }] });
    const provider = new OpenAIProvider({
      provider: "openai",
      model: "gateway-model",
      apiKey: "test",
      apiMode: "chat",
      baseUrl: "https://gateway.example.com/v1/",
    });

    await provider.complete({ messages: [{ role: "user", content: "hello" }] });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://gateway.example.com/v1/chat/completions"
    );
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request).not.toHaveProperty("store");
    expect(request).toHaveProperty("max_tokens", 2048);
  });

  it.each([
    {
      provider: new OpenAIProvider({
        provider: "openai",
        model: "gpt-5.4-mini",
        apiKey: "test",
        apiMode: "responses",
      }),
      response: { output_text: "", status: "completed" },
    },
    {
      provider: new AnthropicProvider({
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        apiKey: "test",
      }),
      response: { content: [{ type: "text", text: "" }] },
    },
    {
      provider: new GoogleProvider({
        provider: "google",
        model: "gemini-2.5-flash",
        apiKey: "test",
      }),
      response: { candidates: [{ content: { parts: [{ text: "" }] } }] },
    },
    {
      provider: new XAIProvider({
        provider: "xai",
        model: "grok-4-fast",
        apiKey: "test",
      }),
      response: { choices: [{ message: { content: "" } }] },
    },
    {
      provider: new DeepSeekProvider({
        provider: "deepseek",
        model: "deepseek-chat",
        apiKey: "test",
      }),
      response: { choices: [{ message: { content: "" } }] },
    },
  ])("rejects empty language completions", async ({ provider, response }) => {
    mockJson(response);

    await expect(
      provider.complete({ messages: [{ role: "user", content: "hello" }] })
    ).rejects.toThrow(/empty completion/i);
  });

  it("uses the configured OpenAI embedding model and shared dimensions", async () => {
    const fetchMock = mockJson({ data: [{ embedding: [0.1] }] });
    const provider = new OpenAIProvider({
      provider: "openai",
      model: "text-embedding-3-large",
      apiKey: "test",
    });
    await provider.embed("hello");
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request).toMatchObject({
      model: "text-embedding-3-large",
      dimensions: EMBEDDING_DIMENSIONS,
    });
  });

  it.each([
    {
      provider: new QwenEmbeddingProvider({
        provider: "qwen",
        model: "text-embedding-v4",
        apiKey: "test",
      }),
      response: { data: [{ embedding: [0.1] }] },
      expected: { dimensions: EMBEDDING_DIMENSIONS },
    },
    {
      provider: new JinaEmbeddingProvider({
        provider: "jina",
        model: "jina-embeddings-v4",
        apiKey: "test",
      }),
      response: { data: [{ embedding: [0.1] }] },
      expected: {
        dimensions: EMBEDDING_DIMENSIONS,
        task: "retrieval.query",
      },
    },
    {
      provider: new CohereEmbeddingProvider({
        provider: "cohere",
        model: "embed-v4.0",
        apiKey: "test",
      }),
      response: { embeddings: { float: [[0.1]] } },
      expected: {
        output_dimension: EMBEDDING_DIMENSIONS,
        input_type: "search_query",
      },
    },
  ])("builds the provider-specific embedding payload", async ({ provider, response, expected }) => {
    const fetchMock = mockJson(response);
    await provider.embed("hello", { inputType: "query" });
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request).toMatchObject(expected);
  });

  it("marks Google embeddings as document or query retrieval input", async () => {
    const fetchMock = mockJson({ embedding: { values: [0.1] } });
    const provider = new GoogleProvider({
      provider: "google",
      model: "gemini-embedding-2",
      apiKey: "test",
    });

    await provider.embed("hello", { inputType: "query" });

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request).toMatchObject({
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: EMBEDDING_DIMENSIONS,
    });
  });
});
