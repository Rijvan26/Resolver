import { EmbeddingProvider, EmbeddingResult, EmbedOptions } from "./types";
import { normalizeVector } from "./cosineSimilarity";

export interface FakeEmbeddingProviderOptions {
  dim?: number;
  model?: string;
  shouldFail?: boolean;
}

/**
 * Fake Embedding Provider
 * Fast, deterministic offline mock that generates normalized vectors based on token hashing.
 * Texts sharing words naturally produce higher cosine similarity scores, making test assertions realistic.
 */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  public readonly name = "fake";
  private dim: number;
  private model: string;
  private shouldFail: boolean;

  constructor(options?: FakeEmbeddingProviderOptions) {
    this.dim = options?.dim ?? 768;
    this.model = options?.model ?? "fake-embedding-v1";
    this.shouldFail = options?.shouldFail ?? false;
  }

  setShouldFail(fail: boolean) {
    this.shouldFail = fail;
  }

  async embed(texts: string[], options?: EmbedOptions): Promise<EmbeddingResult> {
    if (this.shouldFail) {
      throw new Error("FakeEmbeddingProvider simulated offline failure");
    }

    const start = performance.now();
    const dim = this.dim;
    const vectors: number[][] = [];

    for (const text of texts) {
      const vec = new Array(dim).fill(0);
      const clean = text.toLowerCase().trim();
      const tokens = clean.split(/\W+/).filter(Boolean);

      if (tokens.length === 0) {
        // Fallback constant non-zero vector
        vec[0] = 1;
      } else {
        // Hash each token across the vector dimensions
        for (const token of tokens) {
          let hash = 5381;
          for (let i = 0; i < token.length; i++) {
            hash = ((hash << 5) + hash + token.charCodeAt(i)) | 0;
          }
          const index = Math.abs(hash) % dim;
          vec[index] += 1.0;

          // Secondary bucket for richer distribution
          const index2 = Math.abs((hash * 31) | 0) % dim;
          vec[index2] += 0.5;
        }
      }

      vectors.push(normalizeVector(vec));
    }

    return {
      vectors,
      model: options?.model || this.model,
      provider: this.name,
      dim,
      latencyMs: Math.round(performance.now() - start),
    };
  }
}

