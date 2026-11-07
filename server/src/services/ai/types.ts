import { z } from "zod";

/**
 * Request options passed into an AI provider to generate a structured JSON object
 */
export interface GenerateJsonOptions<T = unknown> {
  /**
   * System instruction defining persona, rules, and output expectations
   */
  system: string;
  /**
   * The user-facing prompt / sanitized task input
   */
  prompt: string;
  /**
   * Optional Zod schema or JSON schema to validate output against
   */
  schema?: z.ZodType<T>;
  /**
   * Custom timeout for this call in milliseconds (defaults to AI_TIMEOUT_MS or 30000)
   */
  timeoutMs?: number;
  /**
   * Optional model override if not using the default config.AI_MODEL
   */
  model?: string;
}

/**
 * Token usage telemetry reported by the provider
 */
export interface ProviderUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/**
 * Standard structured result returned by all AI providers
 */
export interface ProviderResult<T = unknown> {
  data: T;
  rawText: string;
  model: string;
  provider: string;
  latencyMs: number;
  usage?: ProviderUsage;
}

/**
 * Structured typed error for all AI provider failures (timeouts, network, rate limits, JSON parsing, validation)
 * Guarantees that provider failures NEVER crash the server process.
 */
export class AiProviderError extends Error {
  public readonly code: string;
  public readonly provider: string;
  public readonly isRetryable: boolean;
  public readonly statusCode?: number;

  constructor(
    message: string,
    options: {
      code: string;
      provider: string;
      isRetryable?: boolean;
      statusCode?: number;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = "AiProviderError";
    this.code = options.code;
    this.provider = options.provider;
    this.isRetryable = options.isRetryable ?? false;
    this.statusCode = options.statusCode;
    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

/**
 * Standard interface for all AI provider adapters
 */
export interface AiProvider {
  readonly name: string;
  generateJson<T = unknown>(options: GenerateJsonOptions<T>): Promise<ProviderResult<T>>;
}

