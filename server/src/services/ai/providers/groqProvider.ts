import {
  AiProvider,
  GenerateJsonOptions,
  ProviderResult,
  AiProviderError,
} from "../types";
import { config } from "../../../config/config";

export interface GroqProviderOptions {
  apiKey?: string;
  defaultModel?: string;
  baseUrl?: string;
}

/**
 * Groq AI Provider Adapter
 * High-speed inference using OpenAI-compatible chat completions endpoint with JSON Mode.
 */
export class GroqProvider implements AiProvider {
  public readonly name = "groq";
  private apiKey: string | undefined;
  private defaultModel: string;
  private baseUrl: string;

  constructor(options?: GroqProviderOptions) {
    this.apiKey = options?.apiKey !== undefined ? options.apiKey : config.GROQ_API_KEY;
    this.defaultModel =
      options?.defaultModel ||
      (config.AI_PROVIDER === "groq" ? config.AI_MODEL : undefined) ||
      "qwen/qwen3.8-27b";
    this.baseUrl = options?.baseUrl || "https://api.groq.com/openai/v1";
  }

  async generateJson<T = unknown>(options: GenerateJsonOptions<T>): Promise<ProviderResult<T>> {
    const start = performance.now();
    const apiKey = this.apiKey;

    if (!apiKey || apiKey.trim() === "") {
      throw new AiProviderError("Groq API key is not configured in backend environment", {
        code: "MISSING_API_KEY",
        provider: this.name,
        isRetryable: false,
      });
    }

    const model = options.model || this.defaultModel;
    const timeoutMs = options.timeoutMs ?? config.AI_TIMEOUT_MS ?? 30000;
    const endpoint = `${this.baseUrl}/chat/completions`;

    // Official Groq requirement: System prompt must explicitly instruct model to output JSON
    const systemPrompt = options.system.toLowerCase().includes("json")
      ? options.system
      : `${options.system}\n\nRespond ONLY with a valid JSON object matching the requested schema.`;

    const requestBody = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: options.prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    };

    const maxRetries = 2;
    let attempt = 0;
    let response!: Response;

    while (attempt <= maxRetries) {
      attempt++;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (response.ok) {
          break;
        }

        const isRateLimit = response.status === 429;
        const isServerError = response.status >= 500;
        const isRetryable = isRateLimit || isServerError;

        if (isRetryable && attempt <= maxRetries) {
          await new Promise((r) => setTimeout(r, 2000 * attempt));
          continue;
        }

        let errorBody = "";
        try {
          errorBody = await response.text();
        } catch {
          // Ignore read failures
        }

        throw new AiProviderError(`Groq API returned HTTP ${response.status}: ${errorBody}`, {
          code: isRateLimit ? "RATE_LIMIT_EXCEEDED" : "API_ERROR",
          provider: this.name,
          statusCode: response.status,
          isRetryable,
        });
      } catch (networkError: unknown) {
        if (networkError instanceof AiProviderError) {
          throw networkError;
        }

        const isTimeout =
          (networkError as Error)?.name === "TimeoutError" ||
          (networkError as Error)?.name === "AbortError";

        if (attempt <= maxRetries) {
          await new Promise((r) => setTimeout(r, 2000 * attempt));
          continue;
        }

        throw new AiProviderError(
          isTimeout
            ? `Groq request timed out after ${timeoutMs}ms`
            : `Network error connecting to Groq API: ${(networkError as Error)?.message || "Unknown error"}`,
          {
            code: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
            provider: this.name,
            isRetryable: true,
            cause: networkError,
          }
        );
      }
    }

    let responseJson: any;
    try {
      responseJson = await response.json();
    } catch (parseErr) {
      throw new AiProviderError("Failed to parse Groq HTTP response as JSON", {
        code: "INVALID_HTTP_RESPONSE",
        provider: this.name,
        isRetryable: false,
        cause: parseErr,
      });
    }

    const rawText = responseJson?.choices?.[0]?.message?.content;
    if (!rawText || typeof rawText !== "string") {
      throw new AiProviderError("Groq response was missing expected message content in choices[0]", {
        code: "EMPTY_COMPLETION",
        provider: this.name,
        isRetryable: false,
      });
    }

    let parsedData: unknown;
    try {
      parsedData = JSON.parse(rawText);
    } catch (jsonErr) {
      throw new AiProviderError(`Failed to parse model output into JSON: ${rawText}`, {
        code: "INVALID_JSON_PAYLOAD",
        provider: this.name,
        isRetryable: false,
        cause: jsonErr,
      });
    }

    let validatedData = parsedData as T;
    if (options.schema) {
      const schemaCheck = options.schema.safeParse(parsedData);
      if (!schemaCheck.success) {
        throw new AiProviderError(
          `Groq output failed schema validation: ${schemaCheck.error.message}`,
          {
            code: "SCHEMA_VALIDATION_ERROR",
            provider: this.name,
            isRetryable: false,
            cause: schemaCheck.error,
          }
        );
      }
      validatedData = schemaCheck.data;
    }

    const latencyMs = Math.round(performance.now() - start);

    return {
      data: validatedData,
      rawText,
      model,
      provider: this.name,
      latencyMs,
      usage: {
        promptTokens: responseJson.usage?.prompt_tokens,
        completionTokens: responseJson.usage?.completion_tokens,
        totalTokens: responseJson.usage?.total_tokens,
      },
    };
  }
}
