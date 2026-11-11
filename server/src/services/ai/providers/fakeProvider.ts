import {
  AiProvider,
  GenerateJsonOptions,
  ProviderResult,
  AiProviderError,
} from "../types";

/**
 * Deterministic canned FakeProvider for offline development and fast unit/integration tests.
 * Zero network dependencies, guaranteed < 5ms latency, supports failure simulation.
 */
export class FakeProvider implements AiProvider {
  public readonly name = "fake";
  private cannedResponse: unknown | null = null;
  private shouldFailWith: Error | null = null;
  private defaultModel = "fake-deterministic-v1";

  constructor(options?: { cannedResponse?: unknown; shouldFailWith?: Error; model?: string }) {
    if (options?.cannedResponse) this.cannedResponse = options.cannedResponse;
    if (options?.shouldFailWith) this.shouldFailWith = options.shouldFailWith;
    if (options?.model) this.defaultModel = options.model;
  }

  /**
   * Inject a canned response for tests
   */
  public setCannedResponse(response: unknown): void {
    this.cannedResponse = response;
  }

  /**
   * Simulate a provider failure for test suites
   */
  public setFailure(error: Error | null): void {
    this.shouldFailWith = error;
  }

  async generateJson<T = unknown>(options: GenerateJsonOptions<T>): Promise<ProviderResult<T>> {
    const start = performance.now();

    // Check test-only environment failure modes (Requirement B1)
    const fakeMode = process.env.AI_FAKE_MODE;
    if (fakeMode === "fail") {
      throw new AiProviderError("Simulated FakeProvider failure via AI_FAKE_MODE=fail", {
        code: "SIMULATED_FAILURE",
        provider: this.name,
        isRetryable: false,
      });
    }
    if (fakeMode === "timeout") {
      throw new AiProviderError("Simulated FakeProvider timeout via AI_FAKE_MODE=timeout", {
        code: "TIMEOUT",
        provider: this.name,
        isRetryable: true,
      });
    }
    if (fakeMode === "rate_limit") {
      throw new AiProviderError("Simulated FakeProvider rate limit via AI_FAKE_MODE=rate_limit", {
        code: "RATE_LIMIT",
        provider: this.name,
        isRetryable: true,
      });
    }

    if (this.shouldFailWith) {
      throw new AiProviderError(this.shouldFailWith.message, {
        code: "SIMULATED_FAILURE",
        provider: this.name,
        isRetryable: false,
        cause: this.shouldFailWith,
      });
    }

    let payload: unknown;

    if (fakeMode === "invalid_json") {
      payload = { invalidField: "corrupted_json_payload", wrongType: 12345 };
    } else if (this.cannedResponse) {
      payload = this.cannedResponse;
    } else {
      // Intelligently generate realistic deterministic defaults based on prompt context
      const promptLower = options.prompt.toLowerCase();
      const systemLower = options.system.toLowerCase();

      if (promptLower.includes("runbook") && !promptLower.includes("<tool_result")) {
        payload = {
          explanation: "Relevant to this incident based on service correlation and reported failure indicators.",
        };
      } else if (
        systemLower.includes("read-only incident assistant") ||
        systemLower.includes("fixed allowlist") ||
        promptLower.includes("<user_question>") ||
        promptLower.includes("<tool_result")
      ) {
        if (promptLower.includes('<tool_result name="get_oncall"')) {
          payload = {
            answer: "I don't have that data: No on-call rotation schedule is configured in Resolver.",
            sources: ["get_oncall"],
          };
        } else if (promptLower.includes('<tool_result name="list_open_incidents"')) {
          payload = {
            answer: "Based on active system records, there is 1 open incident: Payment API latency spike.",
            sources: ["list_open_incidents"],
          };
        } else if (promptLower.includes('<tool_result name="get_incident"')) {
          payload = {
            answer: "Incident details: Payment API latency spike, status is OPEN, priority is HIGH.",
            sources: ["get_incident"],
          };
        } else if (promptLower.includes('<tool_result name="get_service"')) {
          payload = {
            answer: "Service details: Tier 1 Payments API owned by Payments Team.",
            sources: ["get_service"],
          };
        } else if (promptLower.includes('<tool_result name="find_incidents_by_service"')) {
          payload = {
            answer: "Found active incidents associated with the specified service.",
            sources: ["find_incidents_by_service"],
          };
        } else if (promptLower.includes("<tool_result")) {
          payload = {
            answer: "I have retrieved the relevant information from system records.",
            sources: ["list_open_incidents"],
          };
        } else if (promptLower.includes("oncall") || promptLower.includes("on-call")) {
          payload = {
            toolCall: { name: "get_oncall", arguments: {} },
            answer: null,
            sources: [],
          };
        } else if (promptLower.includes("service")) {
          payload = {
            toolCall: { name: "get_service", arguments: { serviceName: "Payments API" } },
            answer: null,
            sources: [],
          };
        } else if (promptLower.includes("provide the final answer")) {
          payload = {
            answer: "Based on the retrieved system data, all relevant information has been processed.",
            sources: ["list_open_incidents"],
          };
        } else {
          payload = {
            toolCall: { name: "list_open_incidents", arguments: { limit: 5 } },
            answer: null,
            sources: [],
          };
        }
      } else if (promptLower.includes("postmortem") || systemLower.includes("postmortem")) {
        payload = {
          title: "Postmortem Draft: Service Disruption",
          rootCause: "Memory exhaustion triggered by unindexed database query cascade.",
          impact: "15 minutes of degraded response times on authentication endpoints.",
          timelineSummary: "Incident opened at 10:00 UTC, mitigated at 10:15 UTC.",
          actionItems: [
            "Add compound index to user lookup queries",
            "Establish alert threshold for memory consumption > 80%",
          ],
          lessonsLearned: [
            "Connection pools must bound max queued statements",
            "Automated failover successfully avoided data loss",
          ],
        };
      } else if (
        promptLower.includes("draft") ||
        systemLower.includes("draft") ||
        promptLower.includes("status update") ||
        systemLower.includes("status update")
      ) {
        const isCustomer = promptLower.includes("customer") || systemLower.includes("customer");
        payload = {
          audience: isCustomer ? "customer" : "internal",
          draftText: isCustomer
            ? "We are currently investigating a service issue. Our engineering team is actively working to identify and resolve the problem. We will provide updates as new information becomes available."
            : "Engineering has identified service disruption and responders are actively mitigating. Telemetry shows elevated error rates. Further investigation is underway.",
          summary: isCustomer
            ? "Service issue under investigation"
            : "Active investigation and triage in progress",
        };
      } else if (promptLower.includes("clarif") || systemLower.includes("clarif")) {
        payload = {
          questions: [
            "What specific error messages or HTTP status codes are clients receiving?",
            "Which endpoints or user workflows are most heavily impacted?",
            "When did the elevated error rate begin and how many users are affected?",
          ],
        };
      } else if (promptLower.includes("summary") || systemLower.includes("summary")) {
        payload = {
          summary: "Incident caused by temporary network latency between API gateway and replica cluster. All nodes verified healthy.",
          keyMetrics: { latencyP99Ms: 450, errorRatePercent: 0.1 },
          impact: "Slight read latency for checkout users; zero permanent errors.",
        };
      } else if (promptLower.includes("runbook") || systemLower.includes("runbook")) {
        payload = {
          explanation: "Relevant to this incident based on service correlation and reported failure indicators.",
        };
      } else {
        // Triage default
        payload = {
          suggestedSeverity: "P2",
          reason: "Determined high impact due to repeated health check failures on primary service.",
          confidence: 0.88,
          suggestedService: "Auth Service",
          suggestedTeam: "Security & Identity",
        };
      }
    }

    // Validate against schema if provided
    let validatedData = payload as T;
    if (options.schema) {
      const parsed = options.schema.safeParse(payload);
      if (!parsed.success) {
        throw new AiProviderError(`Schema validation failed on FakeProvider output: ${parsed.error.message}`, {
          code: "SCHEMA_VALIDATION_ERROR",
          provider: this.name,
          isRetryable: false,
          cause: parsed.error,
        });
      }
      validatedData = parsed.data;
    }

    const latencyMs = Math.round(performance.now() - start);

    return {
      data: validatedData,
      rawText: JSON.stringify(payload),
      model: options.model || this.defaultModel,
      provider: this.name,
      latencyMs,
      usage: {
        promptTokens: 42,
        completionTokens: 38,
        totalTokens: 80,
      },
    };
  }
}

