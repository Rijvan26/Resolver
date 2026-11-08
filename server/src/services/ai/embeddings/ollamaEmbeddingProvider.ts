import {
  EmbeddingProvider,
  EmbeddingResult,
  EmbedOptions,
  EmbeddingProviderError,
} from "./types";
import { config } from "../../../config/config";

export interface OllamaEmbeddingProviderOptions {
  host?: string;
  defaultModel?: string;
}

/**
 * Ollama Embedding Provider Adapter
 * Connects to local self-hosted Ollama server endpoint.
 */
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  public readonly name = "ollama";
  private host: string;
  private defaultModel: string;

  constructor(options?: OllamaEmbeddingProviderOptions) {
    this.host = options?.host || config.OLLAMA_HOST || "http://localhost:11434";
    this.defaultModel = options?.defaultModel || config.EMBEDDING_MODEL || "nomic-embed-text";
  }

  async embed(texts: string[], options?: EmbedOptions): Promise<EmbeddingResult> {
    const start = performance.now();
    const model = options?.model || this.defaultModel;
    const timeoutMs = options?.timeoutMs ?? config.AI_TIMEOUT_MS ?? 30000;

    if (!texts || texts.length === 0) {
      return {
        vectors: [],
        model,
        provider: this.name,
        dim: 768,
        latencyMs: 0,
      };
    }

    // Try Ollama /api/embed (batch) first
    try {
      const endpoint = `${this.host}/api/embed`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: texts }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) {
        const json: any = await response.json();
        const embeddings = json?.embeddings;
        if (Array.isArray(embeddings) && embeddings.length > 0) {
          return {
            vectors: embeddings,
            model,
            provider: this.name,
            dim: embeddings[0]?.length || 768,
            latencyMs: Math.round(performance.now() - start),
          };
        }
      }
    } catch {
      // Fallback to legacy single /api/embeddings endpoint
    }

    // Legacy fallback per text
    const vectors: number[][] = [];
    for (const text of texts) {
      try {
        const endpoint = `${this.host}/api/embeddings`;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt: text }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!res.ok) {
          throw new EmbeddingProviderError(`Ollama embedding returned HTTP ${res.status}`, {
            code: "API_ERROR",
            provider: this.name,
            statusCode: res.status,
            isRetryable: res.status >= 500,
          });
        }

        const json: any = await res.json();
        if (Array.isArray(json?.embedding)) {
          vectors.push(json.embedding);
        } else {
          throw new EmbeddingProviderError("Ollama response missing embedding array", {
            code: "MALFORMED_RESPONSE",
            provider: this.name,
            isRetryable: false,
          });
        }
      } catch (err) {
        if (err instanceof EmbeddingProviderError) throw err;
        throw new EmbeddingProviderError(`Ollama connection error: ${(err as Error)?.message}`, {
          code: "NETWORK_ERROR",
          provider: this.name,
          isRetryable: true,
          cause: err,
        });
      }
    }

    return {
      vectors,
      model,
      provider: this.name,
      dim: vectors[0]?.length || 768,
      latencyMs: Math.round(performance.now() - start),
    };
  }
}

