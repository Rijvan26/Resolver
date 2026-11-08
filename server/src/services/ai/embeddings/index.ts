import { EmbeddingProvider } from "./types";
import { FakeEmbeddingProvider } from "./fakeEmbeddingProvider";
import { GeminiEmbeddingProvider } from "./geminiEmbeddingProvider";
import { OllamaEmbeddingProvider } from "./ollamaEmbeddingProvider";
import { config } from "../../../config/config";

export * from "./types";
export * from "./cosineSimilarity";
export * from "./fakeEmbeddingProvider";
export * from "./geminiEmbeddingProvider";
export * from "./ollamaEmbeddingProvider";

/**
 * Factory for creating embedding providers.
 * Reads EMBEDDING_PROVIDER from config if not explicitly supplied.
 */
export function getEmbeddingProvider(name?: string): EmbeddingProvider {
  const providerName = (name || config.EMBEDDING_PROVIDER || "fake").toLowerCase();

  switch (providerName) {
    case "gemini":
      return new GeminiEmbeddingProvider();
    case "ollama":
      return new OllamaEmbeddingProvider();
    case "fake":
    default:
      return new FakeEmbeddingProvider();
  }
}

