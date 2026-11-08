export interface VaguenessInput {
  title?: string | null;
  description?: string | null;
  serviceId?: string | null;
}

export interface VaguenessResult {
  isVague: boolean;
  reason: string | null;
}

/**
 * Common technical symptom keywords that indicate a report contains concrete technical signals
 */
export const SYMPTOM_KEYWORDS = [
  "error",
  "exception",
  "timeout",
  "timed out",
  "crash",
  "500",
  "502",
  "503",
  "504",
  "404",
  "401",
  "403",
  "slow",
  "latency",
  "degraded",
  "down",
  "outage",
  "offline",
  "unreachable",
  "failing",
  "failed",
  "memory leak",
  "oom",
  "cpu spike",
  "disk full",
  "deadlock",
  "broken",
  "dropped",
  "packet loss",
  "overflow",
  "exhausted",
  "connection refused",
  "5xx",
  "4xx",
  "corrupt",
  "hung",
  "freeze",
  "spike",
  "stuck",
  "blank",
];

/**
 * Pure deterministic rule engine evaluating incident report vagueness (FR-05).
 * CHEAP RULES FIRST: Zero LLM tokens spent if the report is already clear or empty.
 */
export function isReportVague(input: VaguenessInput): VaguenessResult {
  const title = (input.title || "").trim();
  const description = (input.description || "").trim();
  const hasService = Boolean(input.serviceId && String(input.serviceId).trim().length > 0);

  // If both are completely empty, it's not a draft report yet
  if (!title && !description) {
    return {
      isVague: false,
      reason: null,
    };
  }

  // Rule 1: Title too short (< 15 characters, e.g. "bug", "it broke", "site is down")
  if (title.length < 15) {
    return {
      isVague: true,
      reason: "Title is very short and lacks descriptive context regarding what is broken.",
    };
  }

  // Rule 2: Description too short (< 30 characters, e.g. "not working please fix asap")
  if (description.length < 30) {
    return {
      isVague: true,
      reason: "Description is too brief to diagnose the technical problem or impacted scope.",
    };
  }

  // Rule 3: Missing symptom/error/impact keywords
  const combinedText = `${title} ${description}`.toLowerCase();
  const hasSymptom = SYMPTOM_KEYWORDS.some((kw) => combinedText.includes(kw));

  if (!hasSymptom) {
    return {
      isVague: true,
      reason: "Report does not mention specific error codes, failure symptoms, or impact indicators.",
    };
  }

  // Rule 4: If no service is selected and description is relatively short (< 60 chars)
  if (!hasService && description.length < 60) {
    return {
      isVague: true,
      reason: "No affected service selected and description lacks service context.",
    };
  }

  // Report passes all heuristic checks - clear enough!
  return {
    isVague: false,
    reason: null,
  };
}

