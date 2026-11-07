import crypto from "crypto";
import { config } from "../../config/config";
import { incidentDao } from "../../dao/incidentDao";
import { serviceDao } from "../../dao/serviceDao";
import { aiSuggestionDao } from "../../dao/aiSuggestionDao";
import { activityDao } from "../../dao/activityDao";
import { commentDao } from "../../dao/commentDao";
import { severityFromRules, AlertRuleInput } from "./rulesEngine";
import { redact } from "./redaction";
import { getAiProvider } from "./providers";
import {
  PROMPTS,
  triageOutputSchema,
  summaryOutputSchema,
  postmortemOutputSchema,
  TriageOutput,
  SummaryOutput,
  PostmortemOutput,
} from "./prompts";
import {
  AI_STATUS,
  AI_SUGGESTION_TYPE,
  AI_USER_DECISION,
  INCIDENT_STATUS,
  ACTIVITY_ACTION,
  IncidentPriority,
  AiUserDecision,
} from "../../types";
import { IAiSuggestion } from "../../models/AiSuggestion";
import { NotFoundError, ValidationError } from "../../utils/errors";

/**
 * Computes deterministic SHA-256 hash of input text for caching and audit logs
 */
export function hashInput(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/**
 * Maps arbitrary severity strings (e.g. "P1", "P2", "CRITICAL") to canonical Resolver IncidentPriority
 */
export function normalizePriority(severity: string): IncidentPriority {
  const upper = severity.toUpperCase().trim();
  if (upper === "P1" || upper === "CRITICAL") return "CRITICAL";
  if (upper === "P2" || upper === "HIGH") return "HIGH";
  if (upper === "P3" || upper === "MEDIUM") return "MEDIUM";
  if (upper === "P4" || upper === "LOW") return "LOW";
  return "MEDIUM";
}

export class AiService {
  /**
   * Generates or computes incident triage:
   * 1. Rules first (pure deterministic check). Tier-1 rules can never be overridden by AI.
   * 2. If rules are inconclusive -> calls external AI provider with redacted & bounded input.
   * 3. AI outputs are suggestions ONLY with userDecision = 'pending'.
   */
  async generateTriage(
    incidentId: string,
    organizationId: string,
    alert?: AlertRuleInput | null
  ): Promise<IAiSuggestion | null> {
    const incident = await incidentDao.findByOrgAndId(organizationId, incidentId);
    if (!incident) {
      throw new NotFoundError("Incident not found");
    }

    // 1. Resolve service metadata if linked
    let serviceDoc = null;
    if (incident.serviceId) {
      const rawServiceId = (incident.serviceId as any)._id
        ? (incident.serviceId as any)._id.toString()
        : incident.serviceId.toString();
      serviceDoc = await serviceDao.findByOrgAndId(organizationId, rawServiceId);
    }

    // 2. RULES ENGINE FIRST (Hard Rule #3: Rules First)
    const ruleResult = severityFromRules({
      service: serviceDoc
        ? { name: serviceDoc.name, tier: serviceDoc.tier, owningTeam: serviceDoc.owningTeam }
        : null,
      alert: alert || { title: incident.title, description: incident.description },
    });

    if (ruleResult) {
      const ruleOutput = {
        suggestedSeverity: ruleResult.severity,
        reason: ruleResult.reason,
        confidence: 1.0,
        suggestedService: serviceDoc?.name || null,
        suggestedTeam: serviceDoc?.owningTeam || null,
        ruleId: ruleResult.ruleId,
      };

      const suggestion = await aiSuggestionDao.create({
        incidentId,
        organizationId,
        type: AI_SUGGESTION_TYPE.TRIAGE,
        inputHash: hashInput(`rules:${ruleResult.ruleId}:${incidentId}`),
        output: ruleOutput,
        model: "rules-engine",
        provider: "rules",
        latencyMs: 1,
        status: "ready",
      });

      await incidentDao.updateByOrgAndId(organizationId, incidentId, {
        "ai.severity": ruleResult.incidentPriority,
        "ai.reason": ruleResult.reason,
        "ai.confidence": 1.0,
        "ai.model": "rules-engine",
        "ai.provider": "rules",
        "ai.suggestedService": serviceDoc?.name || null,
        "ai.suggestedTeam": serviceDoc?.owningTeam || null,
        "ai.status": AI_STATUS.READY,
      });

      return suggestion;
    }

    // 3. RULES WERE INCONCLUSIVE -> AI FALLBACK
    if (!config.AI_ENABLED) {
      await incidentDao.updateByOrgAndId(organizationId, incidentId, {
        "ai.status": AI_STATUS.UNAVAILABLE,
      });
      return null;
    }

    // 4. REDACT SENSITIVE DATA BEFORE CALLING EXTERNAL LLM (Hard Rule #4)
    const sanitizedTitle = redact(incident.title);
    const sanitizedDescription = redact(incident.description);
    const inputToHash = `${sanitizedTitle}::${sanitizedDescription}::${serviceDoc?.name || ""}`;
    const inputHash = hashInput(inputToHash);

    const provider = getAiProvider();
    const prompt = PROMPTS.triage.user({
      title: sanitizedTitle,
      description: sanitizedDescription,
      serviceName: serviceDoc?.name,
      serviceTier: serviceDoc?.tier,
      owningTeam: serviceDoc?.owningTeam,
    });

    try {
      const result = await provider.generateJson<TriageOutput>({
        system: PROMPTS.triage.system,
        prompt,
        schema: triageOutputSchema,
      });

      const canonicalPriority = normalizePriority(result.data.suggestedSeverity);

      const suggestion = await aiSuggestionDao.create({
        incidentId,
        organizationId,
        type: AI_SUGGESTION_TYPE.TRIAGE,
        inputHash,
        output: result.data as unknown as Record<string, unknown>,
        model: result.model,
        provider: result.provider,
        latencyMs: result.latencyMs,
        status: "ready",
      });

      await incidentDao.updateByOrgAndId(organizationId, incidentId, {
        "ai.severity": canonicalPriority,
        "ai.reason": result.data.reason,
        "ai.confidence": result.data.confidence,
        "ai.suggestedService": result.data.suggestedService || null,
        "ai.suggestedTeam": result.data.suggestedTeam || null,
        "ai.model": result.model,
        "ai.provider": result.provider,
        "ai.status": AI_STATUS.READY,
      });

      return suggestion;
    } catch (providerErr: unknown) {
      console.error(
        "❌ [aiService.generateTriage] LLM Provider error (failing open):",
        (providerErr as Error)?.message || providerErr
      );

      await incidentDao.updateByOrgAndId(organizationId, incidentId, {
        "ai.status": AI_STATUS.FAILED,
      });

      await aiSuggestionDao.create({
        incidentId,
        organizationId,
        type: AI_SUGGESTION_TYPE.TRIAGE,
        inputHash,
        output: { error: (providerErr as Error)?.message || "Unknown error" },
        model: config.AI_MODEL,
        provider: config.AI_PROVIDER,
        status: "failed",
      });

      return null;
    }
  }

  /**
   * Generates a concise status summary for responders joining an active incident.
   */
  async generateSummary(
    incidentId: string,
    organizationId: string,
    actorId?: string
  ): Promise<IAiSuggestion | null> {
    const incident = await incidentDao.findByOrgAndId(organizationId, incidentId);
    if (!incident) {
      throw new NotFoundError("Incident not found");
    }

    if (!config.AI_ENABLED) {
      await incidentDao.updateByOrgAndId(organizationId, incidentId, {
        "ai.status": AI_STATUS.UNAVAILABLE,
      });
      return null;
    }

    // Fetch recent timeline events and comments (bounded to max 20)
    const activities = await activityDao.findActivitiesByIncident(organizationId, incidentId, {
      limit: 20,
      sortOrder: "desc",
    });
    const comments = await commentDao.findCommentsByIncident(organizationId, incidentId, {
      limit: 20,
      sortOrder: "desc",
    });

    const timelineEntries = activities.map((a) =>
      redact(`[${a.action}] ${JSON.stringify(a.metadata || {})}`)
    );
    const recentComments = comments.map((c) => redact(c.content));

    const prompt = PROMPTS.summary.user({
      title: redact(incident.title),
      description: redact(incident.description),
      status: incident.status,
      priority: incident.priority,
      timelineEntries,
      recentComments,
    });

    const inputHash = hashInput(`summary:${incidentId}:${timelineEntries.join(":")}`);
    const provider = getAiProvider();

    try {
      const result = await provider.generateJson<SummaryOutput>({
        system: PROMPTS.summary.system,
        prompt,
        schema: summaryOutputSchema,
      });

      const suggestion = await aiSuggestionDao.create({
        incidentId,
        organizationId,
        type: AI_SUGGESTION_TYPE.SUMMARY,
        inputHash,
        output: result.data as unknown as Record<string, unknown>,
        model: result.model,
        provider: result.provider,
        latencyMs: result.latencyMs,
        status: "ready",
      });

      await incidentDao.updateByOrgAndId(organizationId, incidentId, {
        "ai.summary": result.data.summary,
        "ai.summaryUpdatedAt": new Date(),
        "ai.status": AI_STATUS.READY,
      });

      if (actorId) {
        await activityDao.create({
          organizationId,
          incidentId,
          actorId,
          action: ACTIVITY_ACTION.AI_SUGGESTION_GENERATED,
          metadata: {
            suggestionId: suggestion._id.toString(),
            type: AI_SUGGESTION_TYPE.SUMMARY,
          },
        });
      }

      return suggestion;
    } catch (providerErr: unknown) {
      console.error(
        "❌ [aiService.generateSummary] Provider error (fail-open):",
        (providerErr as Error)?.message || providerErr
      );

      await incidentDao.updateByOrgAndId(organizationId, incidentId, {
        "ai.status": AI_STATUS.FAILED,
      });

      return null;
    }
  }

  /**
   * Generates a blameless postmortem draft.
   * STRICT GUARD: Only allowed for RESOLVED or CLOSED incidents.
   */
  async generatePostmortem(
    incidentId: string,
    organizationId: string,
    actorId?: string
  ): Promise<IAiSuggestion | null> {
    const incident = await incidentDao.findByOrgAndId(organizationId, incidentId);
    if (!incident) {
      throw new NotFoundError("Incident not found");
    }

    // STRICT RESOLUTION GUARD
    if (
      incident.status !== INCIDENT_STATUS.RESOLVED &&
      incident.status !== INCIDENT_STATUS.CLOSED
    ) {
      throw new ValidationError(
        `Postmortems can only be generated for resolved or closed incidents (current status: ${incident.status})`
      );
    }

    if (!config.AI_ENABLED) {
      return null;
    }

    // Fetch up to 20 chronological timeline events
    const activities = await activityDao.findActivitiesByIncident(organizationId, incidentId, {
      limit: 20,
      sortOrder: "asc",
    });

    const timelineEvents = activities.map((a) =>
      redact(
        `[${a.createdAt ? new Date(a.createdAt).toISOString() : ""}] ${a.action}: ${JSON.stringify(
          a.metadata || {}
        )}`
      )
    );

    const prompt = PROMPTS.postmortem.user({
      title: redact(incident.title),
      description: redact(incident.description),
      createdAt: incident.createdAt ? incident.createdAt.toISOString() : new Date().toISOString(),
      resolvedAt: incident.resolvedAt ? incident.resolvedAt.toISOString() : undefined,
      timelineEvents,
      resolutionNotes: incident.description,
    });

    const inputHash = hashInput(`postmortem:${incidentId}:${activities.length}`);
    const provider = getAiProvider();

    try {
      const result = await provider.generateJson<PostmortemOutput>({
        system: PROMPTS.postmortem.system,
        prompt,
        schema: postmortemOutputSchema,
      });

      const suggestion = await aiSuggestionDao.create({
        incidentId,
        organizationId,
        type: AI_SUGGESTION_TYPE.POSTMORTEM,
        inputHash,
        output: result.data as unknown as Record<string, unknown>,
        model: result.model,
        provider: result.provider,
        latencyMs: result.latencyMs,
        status: "ready",
      });

      if (actorId) {
        await activityDao.create({
          organizationId,
          incidentId,
          actorId,
          action: ACTIVITY_ACTION.AI_SUGGESTION_GENERATED,
          metadata: {
            suggestionId: suggestion._id.toString(),
            type: AI_SUGGESTION_TYPE.POSTMORTEM,
          },
        });
      }

      return suggestion;
    } catch (providerErr: unknown) {
      console.error(
        "❌ [aiService.generatePostmortem] Provider error (fail-open):",
        (providerErr as Error)?.message || providerErr
      );

      await aiSuggestionDao.create({
        incidentId,
        organizationId,
        type: AI_SUGGESTION_TYPE.POSTMORTEM,
        inputHash,
        output: { error: (providerErr as Error)?.message || "Failed to generate postmortem" },
        model: config.AI_MODEL,
        provider: config.AI_PROVIDER,
        status: "failed",
      });

      return null;
    }
  }

  /**
   * Records human-in-the-loop decision (Accept, Edit, Dismiss).
   * HARD RULE #1: Accepting triage is the ONLY way `ai.severity` becomes `finalSeverity`.
   */
  async recordDecision(
    suggestionId: string,
    organizationId: string,
    userId: string,
    decision: AiUserDecision,
    editedOutput?: Record<string, unknown>
  ): Promise<IAiSuggestion> {
    const suggestion = await aiSuggestionDao.findByOrgAndId(organizationId, suggestionId);
    if (!suggestion) {
      throw new NotFoundError("AI suggestion not found");
    }

    if (
      decision !== AI_USER_DECISION.ACCEPTED &&
      decision !== AI_USER_DECISION.EDITED &&
      decision !== AI_USER_DECISION.DISMISSED
    ) {
      throw new ValidationError("Decision must be accepted, edited, or dismissed");
    }

    // 1. Triage Decision Handling
    if (suggestion.type === AI_SUGGESTION_TYPE.TRIAGE) {
      if (decision === AI_USER_DECISION.ACCEPTED || decision === AI_USER_DECISION.EDITED) {
        let chosenSeverity: string;
        if (decision === AI_USER_DECISION.EDITED && editedOutput?.suggestedSeverity) {
          chosenSeverity = String(editedOutput.suggestedSeverity);
        } else {
          chosenSeverity = String(
            suggestion.output?.suggestedSeverity ||
              suggestion.output?.severity ||
              "MEDIUM"
          );
        }

        const canonicalSeverity = normalizePriority(chosenSeverity);

        // HARD RULE #1: Human acceptance explicitly sets `finalSeverity` and `aiAccepted = true`
        await incidentDao.updateByOrgAndId(organizationId, suggestion.incidentId, {
          finalSeverity: canonicalSeverity,
          priority: canonicalSeverity,
          aiAccepted: true,
        });
      } else if (decision === AI_USER_DECISION.DISMISSED) {
        await incidentDao.updateByOrgAndId(organizationId, suggestion.incidentId, {
          aiAccepted: false,
        });
      }
    }

    // 2. Summary Decision Handling
    if (suggestion.type === AI_SUGGESTION_TYPE.SUMMARY) {
      if (decision === AI_USER_DECISION.EDITED && editedOutput?.summary) {
        await incidentDao.updateByOrgAndId(organizationId, suggestion.incidentId, {
          "ai.summary": String(editedOutput.summary),
          "ai.summaryUpdatedAt": new Date(),
        });
      }
    }

    // 3. Update audit record in `ai_suggestions` collection
    const updated = await aiSuggestionDao.updateDecisionByOrgAndId(
      organizationId,
      suggestionId,
      decision,
      userId,
      editedOutput || null
    );

    // 4. Log immutable audit activity
    await activityDao.create({
      organizationId,
      incidentId: suggestion.incidentId,
      actorId: userId,
      action: ACTIVITY_ACTION.AI_SUGGESTION_DECIDED,
      metadata: {
        suggestionId,
        type: suggestion.type,
        decision,
        editedOutput: editedOutput || null,
      },
    });

    return updated!;
  }

  /**
   * Retrieves active AI metadata and recent suggestions for an incident
   */
  async getIncidentAiStatus(incidentId: string, organizationId: string) {
    const incident = await incidentDao.findByOrgAndId(organizationId, incidentId);
    if (!incident) {
      throw new NotFoundError("Incident not found");
    }

    const [latestTriage, latestSummary, latestPostmortem] = await Promise.all([
      aiSuggestionDao.findLatestByIncidentAndType(incidentId, AI_SUGGESTION_TYPE.TRIAGE),
      aiSuggestionDao.findLatestByIncidentAndType(incidentId, AI_SUGGESTION_TYPE.SUMMARY),
      aiSuggestionDao.findLatestByIncidentAndType(incidentId, AI_SUGGESTION_TYPE.POSTMORTEM),
    ]);

    return {
      ai: incident.ai || { status: AI_STATUS.NONE },
      finalSeverity: incident.finalSeverity ?? null,
      aiAccepted: incident.aiAccepted ?? false,
      suggestions: {
        triage: latestTriage,
        summary: latestSummary,
        postmortem: latestPostmortem,
      },
    };
  }
}

export const aiService = new AiService();
export default aiService;
