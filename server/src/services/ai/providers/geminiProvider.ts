import {
  AiProvider,
  GenerateJsonOptions,
  ProviderResult,
  AiProviderError,
} from "../types";
import { config } from "../../../config/config";

export interface GeminiProviderOptions {
  apiKey?: string;
  defaultModel?: string;
  baseUrl?: string;
}

/**
 * Google Gemini AI Provider Adapter
 * Uses Google Generative Language REST API (v1beta) with generationConfig.responseMimeType="application/json".
 */
export class GeminiProvider implements AiProvider {
  public readonly name = "gemini";
  private apiKey: string | undefined;
  private defaultModel: string;
  private baseUrl: string;

  constructor(options?: GeminiProviderOptions) {
    this.apiKey = options?.apiKey !== undefined ? options.apiKey : config.GEMINI_API_KEY;
    this.defaultModel =
      options?.defaultModel ||
      (config.AI_PROVIDER === "gemini" ? config.AI_MODEL : undefined) ||
      "gemini-3.5-flash-lite";
    this.baseUrl =
      options?.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
  }

  async generateJson<T = unknown>(options: GenerateJsonOptions<T>): Promise<ProviderResult<T>> {
    const start = performance.now();
    const apiKey = this.apiKey;

    if (!apiKey || apiKey.trim() === "") {
      throw new AiProviderError("Gemini API key is not configured in backend environment", {
        code: "MISSING_API_KEY",
        provider: this.name,
        isRetryable: false,
      });
    }

    const rawModel = options.model || this.defaultModel;
    // Strip leading "models/" if provided by user config
    const model = rawModel.replace(/^models\//, "");
    const timeoutMs = options.timeoutMs ?? config.AI_TIMEOUT_MS ?? 30000;
    const endpoint = `${this.baseUrl}/models/${model}:generateContent`;

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: options.prompt }],
        },
      ],
      systemInstruction: {
        parts: [{ text: options.system }],
      },
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
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
            "x-goog-api-key": apiKey,
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
          await new Promise((r) => setTimeout(r, 1500 * attempt));
          continue;
        }

        let errorBody = "";
        try {
          errorBody = await response.text();
        } catch {
          // Ignore read failures
        }

        throw new AiProviderError(`Gemini API returned HTTP ${response.status}: ${errorBody}`, {
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
          await new Promise((r) => setTimeout(r, 1500 * attempt));
          continue;
        }

        throw new AiProviderError(
          isTimeout
            ? `Gemini request timed out after ${timeoutMs}ms`
            : `Network error connecting to Gemini API: ${(networkError as Error)?.message || "Unknown error"}`,
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
      throw new AiProviderError("Failed to parse Gemini HTTP response as JSON", {
        code: "INVALID_HTTP_RESPONSE",
        provider: this.name,
        isRetryable: false,
        cause: parseErr,
      });
    }

    const candidate = responseJson?.candidates?.[0];
    const rawText = candidate?.content?.parts?.[0]?.text;

    if (!rawText || typeof rawText !== "string") {
      throw new AiProviderError("Gemini response was missing text parts in candidates[0]", {
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
          `Gemini output failed schema validation: ${schemaCheck.error.message}`,
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
        promptTokens: responseJson.usageMetadata?.promptTokenCount,
        completionTokens: responseJson.usageMetadata?.candidatesTokenCount,
        totalTokens: responseJson.usageMetadata?.totalTokenCount,
      },
    };
  }
}
