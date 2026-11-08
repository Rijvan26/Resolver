import { describe, it, expect } from "vitest";
import {
  mismatchFlag,
  normalizeSeverityToPriority,
  SEVERITY_RANK,
} from "../src/services/ai/mismatchEngine";
import { INCIDENT_PRIORITY } from "../src/types";

describe("AI Step 4: Severity Mismatch Flag (FR-12) - NO LLM", () => {
  describe("1. Severity Normalization & Ranks", () => {
    it("should correctly rank priorities from LOW (1) to CRITICAL (4)", () => {
      expect(SEVERITY_RANK[INCIDENT_PRIORITY.LOW]).toBe(1);
      expect(SEVERITY_RANK[INCIDENT_PRIORITY.MEDIUM]).toBe(2);
      expect(SEVERITY_RANK[INCIDENT_PRIORITY.HIGH]).toBe(3);
      expect(SEVERITY_RANK[INCIDENT_PRIORITY.CRITICAL]).toBe(4);
    });

    it("should normalize both canonical names and P-codes case-insensitively", () => {
      expect(normalizeSeverityToPriority("CRITICAL")).toBe("CRITICAL");
      expect(normalizeSeverityToPriority("p1")).toBe("CRITICAL");
      expect(normalizeSeverityToPriority("P1 ")).toBe("CRITICAL");
      expect(normalizeSeverityToPriority("high")).toBe("HIGH");
      expect(normalizeSeverityToPriority("P2")).toBe("HIGH");
      expect(normalizeSeverityToPriority("medium")).toBe("MEDIUM");
      expect(normalizeSeverityToPriority("P3")).toBe("MEDIUM");
      expect(normalizeSeverityToPriority("low")).toBe("LOW");
      expect(normalizeSeverityToPriority("P4")).toBe("LOW");
    });

    it("should return null for invalid, empty, or missing values", () => {
      expect(normalizeSeverityToPriority(null)).toBeNull();
      expect(normalizeSeverityToPriority(undefined)).toBeNull();
      expect(normalizeSeverityToPriority("")).toBeNull();
      expect(normalizeSeverityToPriority("unknown")).toBeNull();
      expect(normalizeSeverityToPriority("P5")).toBeNull();
    });
  });

  describe("2. Pure Function mismatchFlag - Matching Severities", () => {
    it("should return mismatch: false when reported and rules severities match", () => {
      const severities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

      for (const sev of severities) {
        const result = mismatchFlag({
          reportedSeverity: sev,
          rulesSeverity: sev,
        });

        expect(result.mismatch).toBe(false);
        expect(result.direction).toBeNull();
        expect(result.message).toBeNull();
        expect(result.isDangerous).toBe(false);
        expect(result.rankDiff).toBe(0);
      }
    });

    it("should match when one is P-code and the other is word name", () => {
      const result = mismatchFlag({
        reportedSeverity: "P1",
        rulesSeverity: "CRITICAL",
      });

      expect(result.mismatch).toBe(false);
      expect(result.direction).toBeNull();
      expect(result.isDangerous).toBe(false);
    });
  });

  describe("3. Pure Function mismatchFlag - Under-Reporting (Dangerous Case)", () => {
    const underReportingCases = [
      { reported: "LOW", rules: "MEDIUM", diff: -1 },
      { reported: "LOW", rules: "HIGH", diff: -2 },
      { reported: "LOW", rules: "CRITICAL", diff: -3 },
      { reported: "MEDIUM", rules: "HIGH", diff: -1 },
      { reported: "MEDIUM", rules: "CRITICAL", diff: -2 },
      { reported: "HIGH", rules: "CRITICAL", diff: -1 },
      // P-code variants
      { reported: "P4", rules: "P1", diff: -3 },
      { reported: "P3", rules: "CRITICAL", diff: -2 },
      { reported: "P2", rules: "P1", diff: -1 },
    ];

    for (const testCase of underReportingCases) {
      it(`should flag UNDER-reporting as dangerous for reported=${testCase.reported} vs rules=${testCase.rules}`, () => {
        const result = mismatchFlag({
          reportedSeverity: testCase.reported,
          rulesSeverity: testCase.rules,
        });

        expect(result.mismatch).toBe(true);
        expect(result.direction).toBe("under");
        expect(result.isDangerous).toBe(true);
        expect(result.rankDiff).toBe(testCase.diff);
        expect(result.message).toContain("under-reporting");
        expect(result.message).toContain("automated triage rules recommend");
      });
    }
  });

  describe("4. Pure Function mismatchFlag - Over-Reporting", () => {
    const overReportingCases = [
      { reported: "CRITICAL", rules: "HIGH", diff: 1 },
      { reported: "CRITICAL", rules: "MEDIUM", diff: 2 },
      { reported: "CRITICAL", rules: "LOW", diff: 3 },
      { reported: "HIGH", rules: "MEDIUM", diff: 1 },
      { reported: "HIGH", rules: "LOW", diff: 2 },
      { reported: "MEDIUM", rules: "LOW", diff: 1 },
      // P-code variants
      { reported: "P1", rules: "P4", diff: 3 },
      { reported: "CRITICAL", rules: "P3", diff: 2 },
      { reported: "P2", rules: "LOW", diff: 2 },
    ];

    for (const testCase of overReportingCases) {
      it(`should flag OVER-reporting for reported=${testCase.reported} vs rules=${testCase.rules}`, () => {
        const result = mismatchFlag({
          reportedSeverity: testCase.reported,
          rulesSeverity: testCase.rules,
        });

        expect(result.mismatch).toBe(true);
        expect(result.direction).toBe("over");
        expect(result.isDangerous).toBe(false);
        expect(result.rankDiff).toBe(testCase.diff);
        expect(result.message).toContain("over-reporting");
      });
    }
  });

  describe("5. Missing & Malformed Data Handling (Edge Cases)", () => {
    it("should gracefully return mismatch: false when reportedSeverity is missing", () => {
      const result = mismatchFlag({
        reportedSeverity: null,
        rulesSeverity: "CRITICAL",
      });

      expect(result.mismatch).toBe(false);
      expect(result.direction).toBeNull();
      expect(result.message).toBeNull();
      expect(result.isDangerous).toBe(false);
    });

    it("should gracefully return mismatch: false when rulesSeverity is missing", () => {
      const result = mismatchFlag({
        reportedSeverity: "HIGH",
        rulesSeverity: undefined,
      });

      expect(result.mismatch).toBe(false);
      expect(result.direction).toBeNull();
      expect(result.message).toBeNull();
      expect(result.isDangerous).toBe(false);
    });

    it("should gracefully return mismatch: false when both values are missing", () => {
      const result = mismatchFlag({});

      expect(result.mismatch).toBe(false);
      expect(result.direction).toBeNull();
      expect(result.message).toBeNull();
      expect(result.isDangerous).toBe(false);
    });

    it("should never throw an exception on arbitrary garbage inputs", () => {
      expect(() =>
        mismatchFlag({
          reportedSeverity: "!@#$%^&*()",
          rulesSeverity: "not a severity",
        })
      ).not.toThrow();

      const result = mismatchFlag({
        reportedSeverity: "foo",
        rulesSeverity: "bar",
      });
      expect(result.mismatch).toBe(false);
    });
  });
});
