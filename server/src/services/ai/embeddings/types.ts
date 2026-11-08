export interface EmbeddingResult {
  vectors: number[][];
  model: string;
  provider: string;
  dim: number;
  latencyMs?: number;
}

export interface EmbedOptions {
  model?: string;
  timeoutMs?: number;
}

export interface EmbeddingProvider {
  readonly name: string;
  embed(texts: string[], options?: EmbedOptions): Promise<EmbeddingResult>;
}

export class EmbeddingProviderError extends Error {
  public readonly code: string;
  public readonly provider: string;
  public readonly statusCode?: number;
  public readonly isRetryable: boolean;

  constructor(
    message: string,
    options: {
      code: string;
      provider: string;
      statusCode?: number;
      isRetryable?: boolean;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = "EmbeddingProviderError";
    this.code = options.code;
    this.provider = options.provider;
    this.statusCode = options.statusCode;
    this.isRetryable = options.isRetryable ?? false;
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

