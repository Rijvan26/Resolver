import { IncidentPriority, INCIDENT_PRIORITY } from "@/types";

export type MismatchDirection = "under" | "over";

export interface MismatchFlagInput {
  reportedSeverity?: string | null;
  rulesSeverity?: string | null;
}

export interface MismatchFlagResult {
  mismatch: boolean;
  direction: MismatchDirection | null;
  message: string | null;
  reportedPriority: IncidentPriority | null;
  rulesPriority: IncidentPriority | null;
  rankDiff: number;
  isDangerous: boolean;
}

export const SEVERITY_RANK: Record<IncidentPriority, number> = {
  [INCIDENT_PRIORITY.CRITICAL]: 4,
  [INCIDENT_PRIORITY.HIGH]: 3,
  [INCIDENT_PRIORITY.MEDIUM]: 2,
  [INCIDENT_PRIORITY.LOW]: 1,
};

export function normalizeSeverityToPriority(
  severity: string | null | undefined
): IncidentPriority | null {
  if (!severity || typeof severity !== "string") return null;
  const upper = severity.toUpperCase().trim();
  if (upper === "CRITICAL" || upper === "P1") return INCIDENT_PRIORITY.CRITICAL;
  if (upper === "HIGH" || upper === "P2") return INCIDENT_PRIORITY.HIGH;
  if (upper === "MEDIUM" || upper === "P3") return INCIDENT_PRIORITY.MEDIUM;
  if (upper === "LOW" || upper === "P4") return INCIDENT_PRIORITY.LOW;
  return null;
}

export function mismatchFlag(input: MismatchFlagInput): MismatchFlagResult {
  const reportedPriority = normalizeSeverityToPriority(input.reportedSeverity);
  const rulesPriority = normalizeSeverityToPriority(input.rulesSeverity);

  if (!reportedPriority || !rulesPriority) {
    return {
      mismatch: false,
      direction: null,
      message: null,
      reportedPriority,
      rulesPriority,
      rankDiff: 0,
      isDangerous: false,
    };
  }

  const reportedRank = SEVERITY_RANK[reportedPriority];
  const rulesRank = SEVERITY_RANK[rulesPriority];
  const rankDiff = reportedRank - rulesRank;

  if (rankDiff === 0) {
    return {
      mismatch: false,
      direction: null,
      message: null,
      reportedPriority,
      rulesPriority,
      rankDiff: 0,
      isDangerous: false,
    };
  }

  if (rankDiff < 0) {
    // Under-reporting: reported lower than rules (DANGEROUS)
    return {
      mismatch: true,
      direction: "under",
      message: `Potential severity under-reporting: Incident was reported as ${reportedPriority}, but automated triage rules recommend ${rulesPriority}.`,
      reportedPriority,
      rulesPriority,
      rankDiff,
      isDangerous: true,
    };
  } else {
    // Over-reporting: reported higher than rules
    return {
      mismatch: true,
      direction: "over",
      message: `Potential severity over-reporting: Incident was reported as ${reportedPriority}, while automated triage rules suggest ${rulesPriority}.`,
      reportedPriority,
      rulesPriority,
      rankDiff,
      isDangerous: false,
    };
  }
}

