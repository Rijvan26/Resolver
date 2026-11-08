import {
  EmbeddingProvider,
  EmbeddingResult,
  EmbedOptions,
  EmbeddingProviderError,
} from "./types";
import { config } from "../../../config/config";

export interface GeminiEmbeddingProviderOptions {
  apiKey?: string;
  defaultModel?: string;
  baseUrl?: string;
  dim?: number;
}

/**
 * Google Gemini Embedding Provider Adapter
 * Connects to Google Generative Language REST API (v1beta) using embedContent / batchEmbedContents.
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  public readonly name = "gemini";
  private apiKey: string | undefined;
  private defaultModel: string;
  private baseUrl: string;
  private targetDim: number;

  constructor(options?: GeminiEmbeddingProviderOptions) {
    this.apiKey = options?.apiKey !== undefined ? options.apiKey : config.GEMINI_API_KEY;
    this.defaultModel = options?.defaultModel || config.EMBEDDING_MODEL || "gemini-embedding-001";
    this.baseUrl = options?.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
    this.targetDim = options?.dim ?? config.EMBEDDING_DIM ?? 768;
  }

  async embed(texts: string[], options?: EmbedOptions): Promise<EmbeddingResult> {
    const start = performance.now();
    const apiKey = this.apiKey;

    if (!apiKey || apiKey.trim() === "") {
      throw new EmbeddingProviderError("Gemini API key is not configured in environment", {
        code: "MISSING_API_KEY",
        provider: this.name,
        isRetryable: false,
      });
    }

    if (!texts || texts.length === 0) {
      return {
        vectors: [],
        model: this.defaultModel,
        provider: this.name,
        dim: this.targetDim,
        latencyMs: 0,
      };
    }

    const rawModel = options?.model || this.defaultModel;
    const model = rawModel.replace(/^models\//, "");
    const timeoutMs = options?.timeoutMs ?? config.AI_TIMEOUT_MS ?? 30000;

    // Use batchEmbedContents if multiple texts, or embedContent for single text
    if (texts.length === 1) {
      const vector = await this.embedSingle(texts[0], model, apiKey, timeoutMs);
      return {
        vectors: [vector],
        model,
        provider: this.name,
        dim: vector.length,
        latencyMs: Math.round(performance.now() - start),
      };
    }

    // Multiple texts
    const vectors = await this.embedBatch(texts, model, apiKey, timeoutMs);
    return {
      vectors,
      model,
      provider: this.name,
      dim: vectors[0]?.length || this.targetDim,
      latencyMs: Math.round(performance.now() - start),
    };
  }

  private async embedSingle(
    text: string,
    model: string,
    apiKey: string,
    timeoutMs: number
  ): Promise<number[]> {
    const endpoint = `${this.baseUrl}/models/${model}:embedContent`;
    const requestBody = {
      content: { parts: [{ text }] },
      outputDimensionality: this.targetDim,
    };

    const maxRetries = 2;
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt++;
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (response.ok) {
          const json: any = await response.json();
          const values = json?.embedding?.values;
          if (!Array.isArray(values) || values.length === 0) {
            throw new EmbeddingProviderError("Gemini response missing embedding.values", {
              code: "MALFORMED_RESPONSE",
              provider: this.name,
              isRetryable: false,
            });
          }
          return values;
        }

        const isRateLimit = response.status === 429;
        const isServerError = response.status >= 500;
        const isRetryable = isRateLimit || isServerError;

        if (isRetryable && attempt <= maxRetries) {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
          continue;
        }

        let errorBody = "";
        try {
          errorBody = await response.text();
        } catch {
          // Ignore
        }

        throw new EmbeddingProviderError(
          `Gemini Embedding API returned HTTP ${response.status}: ${errorBody}`,
          {
            code: isRateLimit ? "RATE_LIMIT_EXCEEDED" : "API_ERROR",
            provider: this.name,
            statusCode: response.status,
            isRetryable,
          }
        );
      } catch (networkError: unknown) {
        if (networkError instanceof EmbeddingProviderError) {
          throw networkError;
        }

        const isTimeout =
          (networkError as Error)?.name === "TimeoutError" ||
          (networkError as Error)?.name === "AbortError";

        if (attempt <= maxRetries) {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
          continue;
        }

        throw new EmbeddingProviderError(
          isTimeout
            ? `Gemini Embedding request timed out after ${timeoutMs}ms`
            : `Network error connecting to Gemini Embedding API: ${(networkError as Error)?.message || "Unknown error"}`,
          {
            code: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
            provider: this.name,
            isRetryable: true,
            cause: networkError,
          }
        );
      }
    }

    throw new EmbeddingProviderError("Failed to generate embedding after retries", {
      code: "MAX_RETRIES_EXCEEDED",
      provider: this.name,
      isRetryable: false,
    });
  }

  private async embedBatch(
    texts: string[],
    model: string,
    apiKey: string,
    timeoutMs: number
  ): Promise<number[][]> {
    const endpoint = `${this.baseUrl}/models/${model}:batchEmbedContents`;
    const requestBody = {
      requests: texts.map((text) => ({
        model: `models/${model}`,
        content: { parts: [{ text }] },
        outputDimensionality: this.targetDim,
      })),
    };

    const maxRetries = 2;
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt++;
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (response.ok) {
          const json: any = await response.json();
          const embeddings = json?.embeddings;
          if (!Array.isArray(embeddings) || embeddings.length === 0) {
            throw new EmbeddingProviderError("Gemini batch response missing embeddings array", {
              code: "MALFORMED_RESPONSE",
              provider: this.name,
              isRetryable: false,
            });
          }
          return embeddings.map((e: any) => e.values);
        }

        const isRateLimit = response.status === 429;
        const isServerError = response.status >= 500;
        const isRetryable = isRateLimit || isServerError;

        if (isRetryable && attempt <= maxRetries) {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
          continue;
        }

        let errorBody = "";
        try {
          errorBody = await response.text();
        } catch {
          // Ignore
        }

        throw new EmbeddingProviderError(
          `Gemini Batch Embedding API returned HTTP ${response.status}: ${errorBody}`,
          {
            code: isRateLimit ? "RATE_LIMIT_EXCEEDED" : "API_ERROR",
            provider: this.name,
            statusCode: response.status,
            isRetryable,
          }
        );
      } catch (networkError: unknown) {
        if (networkError instanceof EmbeddingProviderError) {
          throw networkError;
        }

        const isTimeout =
          (networkError as Error)?.name === "TimeoutError" ||
          (networkError as Error)?.name === "AbortError";

        if (attempt <= maxRetries) {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
          continue;
        }

        throw new EmbeddingProviderError(
          isTimeout
            ? `Gemini Batch Embedding request timed out after ${timeoutMs}ms`
            : `Network error connecting to Gemini Batch Embedding API: ${(networkError as Error)?.message || "Unknown error"}`,
          {
            code: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
            provider: this.name,
            isRetryable: true,
            cause: networkError,
          }
        );
      }
    }

    throw new EmbeddingProviderError("Failed to generate batch embeddings after retries", {
      code: "MAX_RETRIES_EXCEEDED",
      provider: this.name,
      isRetryable: false,
    });
  }
}

