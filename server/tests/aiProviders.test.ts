import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
  FakeProvider,
  GroqProvider,
  GeminiProvider,
  OllamaProvider,
  getAiProvider,
} from "../src/services/ai/providers";
import { AiProviderError } from "../src/services/ai/types";
import { config } from "../src/config/config";

describe("AI Provider Adapters", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockRejectedValue(new Error("Network calls must be explicitly mocked in tests"));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("FakeProvider (Zero Network Deterministic Mock)", () => {
    it("should return deterministic triage suggestion by default", async () => {
      const provider = new FakeProvider();
      const result = await provider.generateJson({
        system: "You are an on-call triage assistant.",
        prompt: "Alert: high CPU on payments service",
      });

      expect(result.provider).toBe("fake");
      expect(result.model).toBe("fake-deterministic-v1");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.data).toHaveProperty("suggestedSeverity");
      expect(result.data).toHaveProperty("confidence");
      expect(result.data).toHaveProperty("suggestedService");
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    });

    it("should return deterministic summary when prompt asks for summary", async () => {
      const provider = new FakeProvider();
      const result = await provider.generateJson({
        system: "You are a summary assistant.",
        prompt: "Generate an incident summary for new responders joining",
      });

      expect(result.data).toHaveProperty("summary");
      expect(result.data).toHaveProperty("impact");
    });

    it("should return deterministic postmortem draft when prompt asks for postmortem", async () => {
      const provider = new FakeProvider();
      const result = await provider.generateJson({
        system: "You generate postmortem drafts.",
        prompt: "Generate a postmortem draft for resolved incident",
      });

      expect(result.data).toHaveProperty("rootCause");
      expect(result.data).toHaveProperty("actionItems");
      expect(Array.isArray((result.data as any).actionItems)).toBe(true);
    });

    it("should validate output against a provided Zod schema", async () => {
      const provider = new FakeProvider();
      const triageSchema = z.object({
        suggestedSeverity: z.string(),
        confidence: z.number().min(0).max(1),
        suggestedService: z.string(),
      });

      const result = await provider.generateJson({
        system: "Triage system",
        prompt: "Alert triage",
        schema: triageSchema,
      });

      expect(result.data.suggestedSeverity).toBe("P2");
      expect(result.data.confidence).toBe(0.88);
    });

    it("should throw typed AiProviderError when output fails schema validation", async () => {
      const provider = new FakeProvider({
        cannedResponse: { invalidField: 123 },
      });

      const strictSchema = z.object({
        requiredKey: z.string(),
      });

      await expect(
        provider.generateJson({
          system: "Strict system",
          prompt: "Task",
          schema: strictSchema,
        })
      ).rejects.toThrow(AiProviderError);
    });

    it("should simulate failure when setFailure is configured", async () => {
      const provider = new FakeProvider();
      provider.setFailure(new Error("Simulated connection timeout"));

      await expect(
        provider.generateJson({
          system: "System",
          prompt: "Prompt",
        })
      ).rejects.toThrow(AiProviderError);
    });
  });

  describe("GroqProvider (Mocked HTTP Fetch)", () => {
    it("should fail gracefully with MISSING_API_KEY when no apiKey is supplied", async () => {
      const provider = new GroqProvider({ apiKey: "" });

      await expect(
        provider.generateJson({
          system: "Triage system",
          prompt: "Analyze alert",
        })
      ).rejects.toMatchObject({
        code: "MISSING_API_KEY",
        provider: "groq",
        isRetryable: false,
      });
    });

    it("should succeed and parse valid JSON from choices[0].message.content", async () => {
      const cannedPayload = {
        suggestedSeverity: "P1",
        reason: "Tier-1 auth failure",
        confidence: 0.95,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify(cannedPayload),
              },
            },
          ],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 45,
            total_tokens: 165,
          },
        }),
      } as any);

      const provider = new GroqProvider({
        apiKey: "gsk_test_mock_key_12345",
        defaultModel: "llama-3.3-70b-versatile",
      });

      const result = await provider.generateJson({
        system: "You are a triage assistant.",
        prompt: "Alert: primary replica down",
      });

      expect(result.provider).toBe("groq");
      expect(result.model).toBe("llama-3.3-70b-versatile");
      expect(result.data).toEqual(cannedPayload);
      expect(result.usage?.totalTokens).toBe(165);

      // Verify request payload had JSON object response_format
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const callArgs = (global.fetch as any).mock.calls[0];
      const parsedBody = JSON.parse(callArgs[1].body);
      expect(parsedBody.response_format).toEqual({ type: "json_object" });
      expect(callArgs[1].headers.Authorization).toBe("Bearer gsk_test_mock_key_12345");
    });

    it("should classify 429 Rate Limit as retryable", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "Rate limit reached: TPM exceeded",
      } as any);

      const provider = new GroqProvider({ apiKey: "gsk_test" });

      await expect(
        provider.generateJson({
          system: "System",
          prompt: "Task",
        })
      ).rejects.toMatchObject({
        code: "RATE_LIMIT_EXCEEDED",
        provider: "groq",
        statusCode: 429,
        isRetryable: true,
      });
    });

    it("should classify network timeout as retryable AiProviderError", async () => {
      const timeoutError = new Error("The operation was aborted due to timeout");
      timeoutError.name = "TimeoutError";
      global.fetch = vi.fn().mockRejectedValue(timeoutError);

      const provider = new GroqProvider({ apiKey: "gsk_test" });

      await expect(
        provider.generateJson({
          system: "System",
          prompt: "Task",
        })
      ).rejects.toMatchObject({
        code: "TIMEOUT",
        provider: "groq",
        isRetryable: true,
      });
    });

    it("should reject with INVALID_JSON_PAYLOAD when model emits non-JSON text", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "Here is your analysis: It looks like P1." } }],
        }),
      } as any);

      const provider = new GroqProvider({ apiKey: "gsk_test" });

      await expect(
        provider.generateJson({
          system: "System",
          prompt: "Task",
        })
      ).rejects.toMatchObject({
        code: "INVALID_JSON_PAYLOAD",
        provider: "groq",
        isRetryable: false,
      });
    });
  });

  describe("GeminiProvider (Mocked HTTP Fetch)", () => {
    it("should fail gracefully with MISSING_API_KEY when no apiKey is supplied", async () => {
      const provider = new GeminiProvider({ apiKey: "" });

      await expect(
        provider.generateJson({
          system: "System",
          prompt: "Task",
        })
      ).rejects.toMatchObject({
        code: "MISSING_API_KEY",
        provider: "gemini",
        isRetryable: false,
      });
    });

    it("should succeed and parse valid JSON from candidates[0].content.parts[0].text", async () => {
      const cannedPayload = {
        summary: "Database connection timeouts mitigated by autoscaling pool.",
        impact: "Zero data loss.",
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(cannedPayload) }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 80,
            candidatesTokenCount: 30,
            totalTokenCount: 110,
          },
        }),
      } as any);

      const provider = new GeminiProvider({
        apiKey: "AIzaSy_fake_gemini_key",
        defaultModel: "gemini-2.5-flash",
      });

      const result = await provider.generateJson({
        system: "Summarize incident",
        prompt: "Details of resolved incident",
      });

      expect(result.provider).toBe("gemini");
      expect(result.model).toBe("gemini-2.5-flash");
      expect(result.data).toEqual(cannedPayload);
      expect(result.usage?.totalTokens).toBe(110);

      // Verify header and generationConfig
      const callArgs = (global.fetch as any).mock.calls[0];
      expect(callArgs[1].headers["x-goog-api-key"]).toBe("AIzaSy_fake_gemini_key");
      const parsedBody = JSON.parse(callArgs[1].body);
      expect(parsedBody.generationConfig.responseMimeType).toBe("application/json");
    });

    it("should strip leading 'models/' prefix from model name if provided", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: '{"ok": true}' }] } }],
        }),
      } as any);

      const provider = new GeminiProvider({
        apiKey: "fake_key",
        defaultModel: "models/gemini-2.5-flash",
      });

      await provider.generateJson({ system: "Sys", prompt: "Prompt" });

      const url = (global.fetch as any).mock.calls[0][0];
      expect(url).toContain("/models/gemini-2.5-flash:generateContent");
      expect(url).not.toContain("/models/models/");
    });

    it("should classify 503 Service Unavailable as retryable", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => "The model is overloaded. Please try again later.",
      } as any);

      const provider = new GeminiProvider({ apiKey: "fake_key" });

      await expect(
        provider.generateJson({ system: "Sys", prompt: "Prompt" })
      ).rejects.toMatchObject({
        code: "API_ERROR",
        provider: "gemini",
        statusCode: 503,
        isRetryable: true,
      });
    });
  });

  describe("OllamaProvider (Mocked HTTP Fetch)", () => {
    it("should succeed and parse valid JSON from message.content", async () => {
      const cannedPayload = {
        rootCause: "Deadlock in background migration job",
        actionItems: ["Add lock timeout", "Reschedule during off-peak"],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          message: {
            content: JSON.stringify(cannedPayload),
          },
          prompt_eval_count: 50,
          eval_count: 25,
        }),
      } as any);

      const provider = new OllamaProvider({
        host: "http://localhost:11434",
        defaultModel: "llama3:8b",
      });

      const result = await provider.generateJson({
        system: "Generate postmortem",
        prompt: "Postmortem prompt",
      });

      expect(result.provider).toBe("ollama");
      expect(result.model).toBe("llama3:8b");
      expect(result.data).toEqual(cannedPayload);
      expect(result.usage?.totalTokens).toBe(75);

      const callArgs = (global.fetch as any).mock.calls[0];
      const parsedBody = JSON.parse(callArgs[1].body);
      expect(parsedBody.format).toBe("json");
    });
  });

  describe("Provider Factory (getAiProvider)", () => {
    it("should return FakeProvider for 'fake' or unrecognized name", () => {
      expect(getAiProvider("fake").name).toBe("fake");
      expect(getAiProvider("unknown-name").name).toBe("fake");
      expect(getAiProvider().name).toBe(config.AI_PROVIDER || "fake");
    });

    it("should return GroqProvider for 'groq'", () => {
      expect(getAiProvider("groq").name).toBe("groq");
    });

    it("should return GeminiProvider for 'gemini'", () => {
      expect(getAiProvider("gemini").name).toBe("gemini");
    });

    it("should return OllamaProvider for 'ollama'", () => {
      expect(getAiProvider("ollama").name).toBe("ollama");
    });
  });
});
