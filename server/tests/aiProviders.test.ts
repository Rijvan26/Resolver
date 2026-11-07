import { describe, it, expect } from "vitest";
import { z } from "zod";
import { FakeProvider } from "../src/services/ai/providers/fakeProvider";
import { AiProviderError } from "../src/services/ai/types";

describe("AI Provider Adapter: FakeProvider", () => {
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

