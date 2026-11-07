import {
  IncidentPriority,
  INCIDENT_PRIORITY,
  ServiceTier,
} from "../../types";

/**
 * Standard severity codes returned by the triage rules engine
 */
export type RuleSeverityCode = "P1" | "P2" | "P3" | "P4";

/**
 * Standard Rule Identifiers
 */
export const RULE_IDS = {
  TIER1_DOWN: "RULE_TIER1_DOWN",
  TIER1_HIGH_ERROR_RATE: "RULE_TIER1_HIGH_ERROR_RATE",
  TIER2_DOWN: "RULE_TIER2_DOWN",
  TIER3_DEFAULT: "RULE_TIER3_DEFAULT",
} as const;

export type RuleId = (typeof RULE_IDS)[keyof typeof RULE_IDS];

/**
 * Priority mappings between P-code and Resolver canonical IncidentPriority
 */
export const PRIORITY_MAP: Record<RuleSeverityCode, IncidentPriority> = {
  P1: INCIDENT_PRIORITY.CRITICAL,
  P2: INCIDENT_PRIORITY.HIGH,
  P3: INCIDENT_PRIORITY.MEDIUM,
  P4: INCIDENT_PRIORITY.LOW,
};

export const REVERSE_PRIORITY_MAP: Record<IncidentPriority, RuleSeverityCode> = {
  [INCIDENT_PRIORITY.CRITICAL]: "P1",
  [INCIDENT_PRIORITY.HIGH]: "P2",
  [INCIDENT_PRIORITY.MEDIUM]: "P3",
  [INCIDENT_PRIORITY.LOW]: "P4",
};

/**
 * Input representation for a Service in rules evaluation
 */
export interface ServiceRuleInput {
  name?: string;
  tier?: ServiceTier | number | string | null;
  owningTeam?: string;
  runbookLinks?: string[];
}

/**
 * Input representation for an Alert in rules evaluation
 */
export interface AlertRuleInput {
  type?: string | null;
  status?: string | null;
  errorRate?: number | null;
  error_rate?: number | null;
  errorPercentage?: number | null;
  metricValue?: number | null;
  metricName?: string | null;
  title?: string | null;
  description?: string | null;
  raw?: Record<string, unknown> | null;
}

/**
 * Complete evaluation result returned by the Rules Engine
 */
export interface RuleEvaluationResult {
  /**
   * Rule severity code (P1, P2, P3, P4)
   */
  severity: RuleSeverityCode;
  /**
   * Canonical Resolver incident priority (CRITICAL, HIGH, MEDIUM, LOW)
   */
  incidentPriority: IncidentPriority;
  /**
   * Plain-text explanation of why the rule fired
   */
  reason: string;
  /**
   * Unique identifier of the rule that fired
   */
  ruleId: RuleId;
  /**
   * Whether this rule belongs to Tier-1 (which can NEVER be overridden by AI)
   */
  isTier1Rule: boolean;
}

/**
 * Normalized internal representation of alert input
 */
interface NormalizedAlert {
  isDownOrUnreachable: boolean;
  isDown: boolean;
  errorRatePercent: number | null;
}

/**
 * Helper to normalize and detect down/unreachable alert signals
 */
function normalizeAlert(alert?: AlertRuleInput | null): NormalizedAlert {
  if (!alert) {
    return {
      isDownOrUnreachable: false,
      isDown: false,
      errorRatePercent: null,
    };
  }

  const rawType = (alert.type || alert.status || alert.metricName || "").toLowerCase().trim();
  const rawTitle = (alert.title || "").toLowerCase().trim();

  const matchesDown =
    rawType === "down" ||
    rawType.startsWith("down_") ||
    rawType.endsWith("_down") ||
    rawType.includes("outage") ||
    rawType.includes("crash") ||
    rawTitle.includes("is down") ||
    rawTitle.includes("service down");

  const matchesUnreachable =
    rawType === "unreachable" ||
    rawType.startsWith("unreachable_") ||
    rawType.endsWith("_unreachable") ||
    rawType.includes("unreachable") ||
    rawTitle.includes("unreachable");

  const isDown = matchesDown;
  const isDownOrUnreachable = matchesDown || matchesUnreachable;

  // Extract error rate metric
  let errorRatePercent: number | null = null;
  const candidateValue =
    alert.errorRate ??
    alert.error_rate ??
    alert.errorPercentage ??
    (rawType.includes("error") || (alert.metricName && alert.metricName.toLowerCase().includes("error"))
      ? alert.metricValue
      : null);

  if (typeof candidateValue === "number" && !Number.isNaN(candidateValue)) {
    // If given as ratio (e.g. 0.08 for 8%), convert to percentage
    if (candidateValue > 0 && candidateValue <= 1) {
      errorRatePercent = candidateValue * 100;
    } else {
      errorRatePercent = candidateValue;
    }
  }

  return {
    isDownOrUnreachable,
    isDown,
    errorRatePercent,
  };
}

/**
 * Helper to safely extract integer tier from service input
 */
function extractTier(service?: ServiceRuleInput | null): ServiceTier | null {
  if (!service || service.tier === undefined || service.tier === null) {
    return null;
  }

  const parsed = typeof service.tier === "string" ? parseInt(service.tier, 10) : Number(service.tier);
  if (parsed === 1 || parsed === 2 || parsed === 3) {
    return parsed as ServiceTier;
  }

  return null;
}

/**
 * Pure function: Evaluates deterministic incident severity from Service and Alert.
 *
 * Rules:
 * 1. Tier 1 + alert type down/unreachable -> P1 (Critical)
 * 2. Tier 1 + error rate > 5%            -> P2 (High)
 * 3. Tier 2 + down                       -> P2 (High)
 * 4. Tier 3                              -> P4 (Low)
 * 5. Else                                -> null (inconclusive -> AI fallback)
 *
 * Guarantees:
 * - Pure function (no network, no async, no database, no mutation)
 * - Execution time strictly < 200 ms (typically < 0.05 ms)
 * - Inviolable Tier-1 rule flagging
 */
export function severityFromRules(params: {
  service?: ServiceRuleInput | null;
  alert?: AlertRuleInput | null;
}): RuleEvaluationResult | null {
  const { service, alert } = params;

  const tier = extractTier(service);
  if (tier === null) {
    // Missing service or invalid tier cannot satisfy any tier-based rule -> inconclusive
    return null;
  }

  const normalizedAlert = normalizeAlert(alert);

  // Rule 1: Tier 1 + alert type down/unreachable -> P1
  if (tier === 1 && normalizedAlert.isDownOrUnreachable) {
    return {
      severity: "P1",
      incidentPriority: PRIORITY_MAP.P1,
      reason: "Tier-1 mission-critical service is down or unreachable.",
      ruleId: RULE_IDS.TIER1_DOWN,
      isTier1Rule: true,
    };
  }

  // Rule 2: Tier 1 + error rate > 5% -> P2
  if (tier === 1 && normalizedAlert.errorRatePercent !== null && normalizedAlert.errorRatePercent > 5) {
    return {
      severity: "P2",
      incidentPriority: PRIORITY_MAP.P2,
      reason: `Tier-1 mission-critical service error rate (${normalizedAlert.errorRatePercent.toFixed(1)}%) exceeds 5% threshold.`,
      ruleId: RULE_IDS.TIER1_HIGH_ERROR_RATE,
      isTier1Rule: true,
    };
  }

  // Rule 3: Tier 2 + down -> P2
  if (tier === 2 && normalizedAlert.isDown) {
    return {
      severity: "P2",
      incidentPriority: PRIORITY_MAP.P2,
      reason: "Tier-2 important service is down.",
      ruleId: RULE_IDS.TIER2_DOWN,
      isTier1Rule: false,
    };
  }

  // Rule 4: Tier 3 -> P4
  if (tier === 3) {
    return {
      severity: "P4",
      incidentPriority: PRIORITY_MAP.P4,
      reason: "Tier-3 non-critical service default triage rule.",
      ruleId: RULE_IDS.TIER3_DEFAULT,
      isTier1Rule: false,
    };
  }

  // Inconclusive -> AI triage fallback
  return null;
}

/**
 * Hard Rule #3 & Specification:
 * Tier-1 rule results can NEVER be overridden by AI.
 * Any definitive rule match takes precedence over AI suggestions.
 */
export function canAiOverrideRuleResult(ruleResult: RuleEvaluationResult | null): boolean {
  if (!ruleResult) {
    return true; // No rule fired, AI is free to suggest severity
  }

  // Tier-1 rule results can NEVER be overridden by AI
  if (ruleResult.isTier1Rule) {
    return false;
  }

  // Other definitive rule matches also take precedence
  return false;
}

