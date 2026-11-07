import { describe, it, expect } from "vitest";
import {
  severityFromRules,
  canAiOverrideRuleResult,
  RULE_IDS,
  PRIORITY_MAP,
} from "../src/services/ai/rulesEngine";
import { INCIDENT_PRIORITY } from "../src/types";

describe("AI Rules Engine (severityFromRules)", () => {
  describe("Rule 1: Tier 1 + alert type down/unreachable -> P1 (Critical)", () => {
    it("should return P1 when Tier-1 service alert type is 'down'", () => {
      const result = severityFromRules({
        service: { name: "Auth Service", tier: 1 },
        alert: { type: "down" },
      });

      expect(result).not.toBeNull();
      expect(result?.severity).toBe("P1");
      expect(result?.incidentPriority).toBe(INCIDENT_PRIORITY.CRITICAL);
      expect(result?.ruleId).toBe(RULE_IDS.TIER1_DOWN);
      expect(result?.isTier1Rule).toBe(true);
      expect(result?.reason).toContain("Tier-1");
    });

    it("should handle case-insensitivity ('DOWN', 'Down')", () => {
      const upper = severityFromRules({
        service: { name: "Payments Gateway", tier: 1 },
        alert: { type: "DOWN" },
      });
      expect(upper?.severity).toBe("P1");

      const mixed = severityFromRules({
        service: { name: "Payments Gateway", tier: 1 },
        alert: { type: "Down" },
      });
      expect(mixed?.severity).toBe("P1");
    });

    it("should match compound down alerts like 'service_down' and 'host_down'", () => {
      const compound = severityFromRules({
        service: { name: "Core DB", tier: 1 },
        alert: { type: "service_down" },
      });
      expect(compound?.severity).toBe("P1");
      expect(compound?.ruleId).toBe(RULE_IDS.TIER1_DOWN);
    });

    it("should return P1 when Tier-1 service alert type is 'unreachable'", () => {
      const result = severityFromRules({
        service: { name: "Primary Database", tier: 1 },
        alert: { type: "unreachable" },
      });

      expect(result).not.toBeNull();
      expect(result?.severity).toBe("P1");
      expect(result?.incidentPriority).toBe(INCIDENT_PRIORITY.CRITICAL);
      expect(result?.ruleId).toBe(RULE_IDS.TIER1_DOWN);
      expect(result?.isTier1Rule).toBe(true);
    });

    it("should match compound unreachable alerts like 'UNREACHABLE' and 'host_unreachable'", () => {
      const result = severityFromRules({
        service: { name: "Primary Database", tier: 1 },
        alert: { type: "host_unreachable" },
      });
      expect(result?.severity).toBe("P1");
    });

    it("should detect down state from incident title if type is empty", () => {
      const result = severityFromRules({
        service: { name: "Payments", tier: 1 },
        alert: { title: "Production Payments is down" },
      });
      expect(result?.severity).toBe("P1");
    });
  });

  describe("Rule 2: Tier 1 + error rate > 5% -> P2 (High)", () => {
    it("should return P2 when error rate exceeds 5% as whole percentage", () => {
      const result = severityFromRules({
        service: { name: "Checkout API", tier: 1 },
        alert: { type: "high_error_rate", errorRate: 6 },
      });

      expect(result).not.toBeNull();
      expect(result?.severity).toBe("P2");
      expect(result?.incidentPriority).toBe(INCIDENT_PRIORITY.HIGH);
      expect(result?.ruleId).toBe(RULE_IDS.TIER1_HIGH_ERROR_RATE);
      expect(result?.isTier1Rule).toBe(true);
      expect(result?.reason).toContain("exceeds 5%");
    });

    it("should return P2 when error rate is passed as a decimal ratio (0.08 = 8%)", () => {
      const result = severityFromRules({
        service: { name: "Checkout API", tier: 1 },
        alert: { errorRate: 0.08 },
      });

      expect(result?.severity).toBe("P2");
      expect(result?.ruleId).toBe(RULE_IDS.TIER1_HIGH_ERROR_RATE);
    });

    it("should support alternate snake_case 'error_rate' and 'errorPercentage'", () => {
      const snake = severityFromRules({
        service: { name: "Auth API", tier: 1 },
        alert: { error_rate: 7.5 },
      });
      expect(snake?.severity).toBe("P2");

      const percent = severityFromRules({
        service: { name: "Auth API", tier: 1 },
        alert: { errorPercentage: 10 },
      });
      expect(percent?.severity).toBe("P2");
    });

    it("should support metricValue when metricName is 'error_rate'", () => {
      const metric = severityFromRules({
        service: { name: "Checkout API", tier: 1 },
        alert: { metricName: "http_error_rate", metricValue: 8.2 },
      });
      expect(metric?.severity).toBe("P2");
    });

    it("should return null (inconclusive) when error rate is exactly 5%", () => {
      const result = severityFromRules({
        service: { name: "Checkout API", tier: 1 },
        alert: { errorRate: 5 },
      });
      expect(result).toBeNull();

      const ratio = severityFromRules({
        service: { name: "Checkout API", tier: 1 },
        alert: { errorRate: 0.05 },
      });
      expect(ratio).toBeNull();
    });

    it("should return null (inconclusive) when error rate is below 5%", () => {
      const result = severityFromRules({
        service: { name: "Checkout API", tier: 1 },
        alert: { errorRate: 3.2 },
      });
      expect(result).toBeNull();
    });

    it("should prioritize Tier 1 'down' (P1) over high error rate (P2) if both present", () => {
      const result = severityFromRules({
        service: { name: "Checkout API", tier: 1 },
        alert: { type: "down", errorRate: 15 },
      });

      expect(result?.severity).toBe("P1");
      expect(result?.ruleId).toBe(RULE_IDS.TIER1_DOWN);
    });
  });

  describe("Rule 3: Tier 2 + down -> P2 (High)", () => {
    it("should return P2 when Tier-2 service is down", () => {
      const result = severityFromRules({
        service: { name: "Search Service", tier: 2 },
        alert: { type: "down" },
      });

      expect(result).not.toBeNull();
      expect(result?.severity).toBe("P2");
      expect(result?.incidentPriority).toBe(INCIDENT_PRIORITY.HIGH);
      expect(result?.ruleId).toBe(RULE_IDS.TIER2_DOWN);
      expect(result?.isTier1Rule).toBe(false);
      expect(result?.reason).toContain("Tier-2");
    });

    it("should handle case-insensitivity on Tier 2 down", () => {
      const result = severityFromRules({
        service: { name: "Notification Service", tier: 2 },
        alert: { type: "DOWN" },
      });
      expect(result?.severity).toBe("P2");
    });

    it("should return null (inconclusive) when Tier-2 alert is not 'down'", () => {
      // Tier 2 high error rate does not match Tier 2 down rule
      const highError = severityFromRules({
        service: { name: "Search Service", tier: 2 },
        alert: { type: "high_error_rate", errorRate: 20 },
      });
      expect(highError).toBeNull();

      // Tier 2 unreachable does not match down rule
      const unreachable = severityFromRules({
        service: { name: "Search Service", tier: 2 },
        alert: { type: "unreachable" },
      });
      expect(unreachable).toBeNull();

      // Generic latency
      const latency = severityFromRules({
        service: { name: "Search Service", tier: 2 },
        alert: { type: "latency" },
      });
      expect(latency).toBeNull();
    });
  });

  describe("Rule 4: Tier 3 -> P4 (Low)", () => {
    it("should return P4 for any Tier-3 service alert", () => {
      const result = severityFromRules({
        service: { name: "Internal Admin Dashboard", tier: 3 },
        alert: { type: "down" },
      });

      expect(result).not.toBeNull();
      expect(result?.severity).toBe("P4");
      expect(result?.incidentPriority).toBe(INCIDENT_PRIORITY.LOW);
      expect(result?.ruleId).toBe(RULE_IDS.TIER3_DEFAULT);
      expect(result?.isTier1Rule).toBe(false);
      expect(result?.reason).toContain("Tier-3");
    });

    it("should return P4 for Tier-3 even if alert is null or empty", () => {
      const result = severityFromRules({
        service: { name: "Analytics ETL Worker", tier: 3 },
        alert: null,
      });

      expect(result?.severity).toBe("P4");
      expect(result?.ruleId).toBe(RULE_IDS.TIER3_DEFAULT);
    });

    it("should accept string tier representation '3'", () => {
      const result = severityFromRules({
        service: { name: "Reporting", tier: "3" as unknown as 3 },
      });
      expect(result?.severity).toBe("P4");
    });
  });

  describe("Edge cases & Inconclusive evaluation (returning null)", () => {
    it("should return null when service is missing or null", () => {
      expect(severityFromRules({ service: null, alert: { type: "down" } })).toBeNull();
      expect(severityFromRules({ service: undefined, alert: { type: "down" } })).toBeNull();
    });

    it("should return null when service tier is missing or invalid", () => {
      expect(severityFromRules({ service: { name: "Unknown" }, alert: { type: "down" } })).toBeNull();
      expect(severityFromRules({ service: { name: "Unknown", tier: null }, alert: { type: "down" } })).toBeNull();
      expect(severityFromRules({ service: { name: "Unknown", tier: 0 as any }, alert: { type: "down" } })).toBeNull();
      expect(severityFromRules({ service: { name: "Unknown", tier: 4 as any }, alert: { type: "down" } })).toBeNull();
      expect(severityFromRules({ service: { name: "Unknown", tier: -1 as any }, alert: { type: "down" } })).toBeNull();
      expect(severityFromRules({ service: { name: "Unknown", tier: "invalid" as any }, alert: { type: "down" } })).toBeNull();
    });

    it("should return null when Tier-1 alert is missing or has unknown alert type", () => {
      expect(severityFromRules({ service: { tier: 1 }, alert: null })).toBeNull();
      expect(severityFromRules({ service: { tier: 1 }, alert: { type: "cpu_spike" } })).toBeNull();
      expect(severityFromRules({ service: { tier: 1 }, alert: { type: "memory_warning" } })).toBeNull();
    });

    it("should return null when error rate is negative, NaN, or non-numeric", () => {
      expect(severityFromRules({ service: { tier: 1 }, alert: { errorRate: -5 } })).toBeNull();
      expect(severityFromRules({ service: { tier: 1 }, alert: { errorRate: NaN } })).toBeNull();
      expect(severityFromRules({ service: { tier: 1 }, alert: { errorRate: null } })).toBeNull();
    });
  });

  describe("Hard Rule #3: Tier-1 rule results can NEVER be overridden by AI", () => {
    it("should forbid AI override for RULE_TIER1_DOWN", () => {
      const result = severityFromRules({
        service: { tier: 1 },
        alert: { type: "down" },
      });
      expect(result).not.toBeNull();
      expect(canAiOverrideRuleResult(result)).toBe(false);
    });

    it("should forbid AI override for RULE_TIER1_HIGH_ERROR_RATE", () => {
      const result = severityFromRules({
        service: { tier: 1 },
        alert: { errorRate: 10 },
      });
      expect(result).not.toBeNull();
      expect(canAiOverrideRuleResult(result)).toBe(false);
    });

    it("should allow AI triage when rules return null (inconclusive)", () => {
      expect(canAiOverrideRuleResult(null)).toBe(true);
    });
  });

  describe("Performance benchmark (< 200 ms with zero network calls)", () => {
    it("should execute 10,000 evaluations in well under 200 ms", () => {
      const start = performance.now();

      for (let i = 0; i < 10000; i++) {
        severityFromRules({
          service: { name: "Benchmarking Service", tier: (i % 3 + 1) as 1 | 2 | 3 },
          alert: { type: i % 2 === 0 ? "down" : "latency", errorRate: (i % 10) },
        });
      }

      const elapsedMs = performance.now() - start;

      // 10,000 iterations should take well under 100 ms on any hardware
      expect(elapsedMs).toBeLessThan(200);
    });
  });
});

