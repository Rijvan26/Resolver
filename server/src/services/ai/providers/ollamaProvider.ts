import {
  AiProvider,
  GenerateJsonOptions,
  ProviderResult,
  AiProviderError,
} from "../types";
import { config } from "../../../config/config";

export interface OllamaProviderOptions {
  host?: string;
  defaultModel?: string;
}

/**
 * Ollama AI Provider Adapter
 * Connects to a local or self-hosted Ollama HTTP daemon with JSON mode enabled.
 */
export class OllamaProvider implements AiProvider {
  public readonly name = "ollama";
  private host: string;
  private defaultModel: string;

  constructor(options?: OllamaProviderOptions) {
    this.host = (options?.host || config.OLLAMA_HOST || "http://localhost:11434").replace(
      /\/$/,
      ""
    );
    this.defaultModel = options?.defaultModel || config.AI_MODEL || "llama3:8b";
  }

  async generateJson<T = unknown>(options: GenerateJsonOptions<T>): Promise<ProviderResult<T>> {
    const start = performance.now();
    const model = options.model || this.defaultModel;
    const timeoutMs = options.timeoutMs ?? config.AI_TIMEOUT_MS ?? 30000;
    const endpoint = `${this.host}/api/chat`;

    const requestBody = {
      model,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.prompt },
      ],
      format: "json",
      stream: false,
    };

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (networkError: unknown) {
      const isTimeout =
        (networkError as Error)?.name === "TimeoutError" ||
        (networkError as Error)?.name === "AbortError";

      throw new AiProviderError(
        isTimeout
          ? `Ollama request timed out after ${timeoutMs}ms`
          : `Network error connecting to Ollama at ${this.host}: ${(networkError as Error)?.message || "Is Ollama running?"}`,
        {
          code: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
          provider: this.name,
          isRetryable: true,
          cause: networkError,
        }
      );
    }

    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = await response.text();
      } catch {
        // Ignore read failures
      }

      throw new AiProviderError(`Ollama HTTP ${response.status}: ${errorBody}`, {
        code: "API_ERROR",
        provider: this.name,
        statusCode: response.status,
        isRetryable: response.status >= 500,
      });
    }

    let responseJson: any;
    try {
      responseJson = await response.json();
    } catch (parseErr) {
      throw new AiProviderError("Failed to parse Ollama response as JSON", {
        code: "INVALID_HTTP_RESPONSE",
        provider: this.name,
        isRetryable: false,
        cause: parseErr,
      });
    }

    const rawText = responseJson?.message?.content;
    if (!rawText || typeof rawText !== "string") {
      throw new AiProviderError("Ollama response did not contain message.content", {
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
          `Ollama output failed schema validation: ${schemaCheck.error.message}`,
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
        promptTokens: responseJson.prompt_eval_count,
        completionTokens: responseJson.eval_count,
        totalTokens:
          (responseJson.prompt_eval_count || 0) + (responseJson.eval_count || 0),
      },
    };
  }
}

