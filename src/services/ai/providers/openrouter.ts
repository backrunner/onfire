import { OpenAIProvider } from "./openai";
import type { ProviderConfig } from "./index";

/** OpenRouter exposes an OpenAI-compatible chat/embedding surface. */
export class OpenRouterProvider extends OpenAIProvider {
  name = "openrouter";

  constructor(config: ProviderConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl || "https://openrouter.ai/api/v1",
      apiMode: config.apiMode === "responses" ? "chat" : config.apiMode,
    });
  }
}
