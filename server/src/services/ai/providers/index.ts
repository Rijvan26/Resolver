import { AiProvider } from "../types";
import { FakeProvider } from "./fakeProvider";
import { GroqProvider } from "./groqProvider";
import { GeminiProvider } from "./geminiProvider";
import { OllamaProvider } from "./ollamaProvider";
import { config } from "../../../config/config";
import { AI_PROVIDERS, AiProviderType } from "../../../types";

export * from "./fakeProvider";
export * from "./groqProvider";
export * from "./geminiProvider";
export * from "./ollamaProvider";

/**
 * Factory function to retrieve the configured AI provider instance.
 * Provider is chosen only by config (AI_PROVIDER = fake | groq | gemini | ollama).
 * No code changes needed to switch providers.
 */
export function getAiProvider(providerType?: AiProviderType | string): AiProvider {
  const selected = (providerType || config.AI_PROVIDER || AI_PROVIDERS.FAKE).toLowerCase();

  switch (selected) {
    case AI_PROVIDERS.GROQ:
      return new GroqProvider();
    case AI_PROVIDERS.GEMINI:
      return new GeminiProvider();
    case AI_PROVIDERS.OLLAMA:
      return new OllamaProvider();
    case AI_PROVIDERS.FAKE:
    default:
      return new FakeProvider();
  }
}

