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
import { Types } from "mongoose";
import { Incident } from "../../models/Incident";
import { IncidentEmbedding } from "../../models/IncidentEmbedding";
import { incidentEmbeddingDao } from "../../dao/incidentEmbeddingDao";
import { cosineSimilarity } from "./embeddings/cosineSimilarity";
import { buildIncidentEmbeddingText } from "./embeddings/incidentEmbedText";
import { getEmbeddingProvider } from "./embeddings";

export interface SimilarIncidentItem {
  incidentId: string;
  title: string;
  service: string | null;
  finalSeverity: string | null;
  resolutionNotes: string | null;
  similarityScore: number;
  link: string;
}

export interface SimilarIncidentsResult {
  available: boolean;
  reason?: string;
  similarIncidents: SimilarIncidentItem[];
}

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

    // Phase 2 (FR-07): Include up to 3 similar past incidents in triage prompt (fail-open)
    let similarIncidentsForPrompt: Array<{
      title: string;
      service?: string | null;
      finalSeverity?: string | null;
      resolutionNotes?: string | null;
    }> = [];

    try {
      const similarResult = await this.findSimilarIncidents(incidentId, organizationId, { limit: 3 });
      if (similarResult.available && similarResult.similarIncidents.length > 0) {
        similarIncidentsForPrompt = similarResult.similarIncidents.map((s) => ({
          title: s.title,
          service: s.service,
          finalSeverity: s.finalSeverity,
          resolutionNotes: s.resolutionNotes,
        }));
      }
    } catch {
      // Fail-open: continue without similar incidents if unavailable
    }

    const provider = getAiProvider();
    const prompt = PROMPTS.triage.user({
      title: sanitizedTitle,
      description: sanitizedDescription,
      serviceName: serviceDoc?.name,
      serviceTier: serviceDoc?.tier,
      owningTeam: serviceDoc?.owningTeam,
      similarIncidents: similarIncidentsForPrompt,
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

    // 3. Duplicate Decision Handling (FR-06)
    if (suggestion.type === AI_SUGGESTION_TYPE.DUPLICATE) {
      if (decision === AI_USER_DECISION.ACCEPTED) {
        const output = suggestion.output as {
          bestMatchIncidentId?: string;
          candidateIncidentIds?: string[];
        } | undefined;

        const candidateIdToLink =
          (editedOutput?.targetIncidentId as string) ||
          output?.bestMatchIncidentId ||
          output?.candidateIncidentIds?.[0];

        if (candidateIdToLink) {
          const candidateObjId = new Types.ObjectId(candidateIdToLink);
          const currentIncidentObjId = new Types.ObjectId(suggestion.incidentId);

          // Add to linkedIncidentIds for both incidents (bidirectional link)
          // and mark duplicateOf on the current incident
          await Promise.all([
            Incident.findOneAndUpdate(
              { _id: currentIncidentObjId, organizationId: new Types.ObjectId(organizationId) },
              {
                $addToSet: { linkedIncidentIds: candidateObjId },
                $set: { duplicateOf: candidateObjId },
              }
            ).exec(),
            Incident.findOneAndUpdate(
              { _id: candidateObjId, organizationId: new Types.ObjectId(organizationId) },
              {
                $addToSet: { linkedIncidentIds: currentIncidentObjId },
              }
            ).exec(),
          ]);

          await activityDao.create({
            organizationId,
            incidentId: suggestion.incidentId,
            actorId: userId,
            action: ACTIVITY_ACTION.INCIDENT_LINKED || "INCIDENT_LINKED",
            metadata: {
              linkedIncidentId: candidateIdToLink,
              reason: "AI duplicate suggestion accepted and linked by user",
              suggestionId,
            },
          });
        }
      }
    }

    // 4. Update audit record in `ai_suggestions` collection
    const updated = await aiSuggestionDao.updateDecisionByOrgAndId(
      organizationId,
      suggestionId,
      decision,
      userId,
      editedOutput || null
    );

    // 5. Log immutable audit activity
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

    const [latestTriage, latestSummary, latestPostmortem, latestDuplicate] = await Promise.all([
      aiSuggestionDao.findLatestByIncidentAndType(incidentId, AI_SUGGESTION_TYPE.TRIAGE),
      aiSuggestionDao.findLatestByIncidentAndType(incidentId, AI_SUGGESTION_TYPE.SUMMARY),
      aiSuggestionDao.findLatestByIncidentAndType(incidentId, AI_SUGGESTION_TYPE.POSTMORTEM),
      aiSuggestionDao.findLatestByIncidentAndType(incidentId, AI_SUGGESTION_TYPE.DUPLICATE),
    ]);

    return {
      ai: incident.ai || { status: AI_STATUS.NONE },
      finalSeverity: incident.finalSeverity ?? null,
      aiAccepted: incident.aiAccepted ?? false,
      linkedIncidentIds: incident.linkedIncidentIds || [],
      duplicateOf: incident.duplicateOf ?? null,
      suggestions: {
        triage: latestTriage,
        summary: latestSummary,
        postmortem: latestPostmortem,
        duplicate: latestDuplicate,
      },
    };
  }

  /**
   * FR-07: Find top similar PAST (resolved/closed) incidents using cosine similarity over embeddings.
   * Excludes the target incident itself.
   * Applies minimum similarity threshold from config.
   * Gives a configurable boost for same-service matches.
   * Pure vector calculation — no LLM call needed.
   * Returns { available: false, similarIncidents: [] } fail-open if embeddings or provider are offline.
   */
  async findSimilarIncidents(
    incidentId: string | Types.ObjectId,
    organizationId: string | Types.ObjectId,
    options?: {
      limit?: number;
      minThreshold?: number;
      boostSameService?: number;
    }
  ): Promise<SimilarIncidentsResult> {
    const limit = options?.limit ?? 3;
    const minThreshold = options?.minThreshold ?? config.AI_SIMILAR_THRESHOLD;
    const boostSameService = options?.boostSameService ?? config.AI_SIMILAR_SERVICE_BOOST;

    try {
      const targetObjId = new Types.ObjectId(incidentId);
      const orgObjId = new Types.ObjectId(organizationId);

      // 1. Fetch target incident
      const targetIncident = await Incident.findOne({
        _id: targetObjId,
        organizationId: orgObjId,
      }).lean().exec();

      if (!targetIncident) {
        return { available: false, reason: "Incident not found", similarIncidents: [] };
      }

      // 2. Fetch or compute target incident embedding
      let targetEmb = await incidentEmbeddingDao.findByIncidentId(targetObjId);

      if (!targetEmb || !targetEmb.vector || targetEmb.vector.length === 0) {
        // Attempt on-the-fly embedding creation (fail-open)
        try {
          const provider = getEmbeddingProvider();
          let serviceName: string | null = null;
          if (targetIncident.serviceId) {
            const svc = await serviceDao.findByOrgAndId(orgObjId, targetIncident.serviceId);
            serviceName = svc?.name || null;
          }

          const prep = buildIncidentEmbeddingText({
            title: targetIncident.title,
            serviceName,
            description: targetIncident.description,
            resolutionNotes: targetIncident.ai?.summary || null,
          });

          const embedResult = await provider.embed([prep.text]);
          if (embedResult.vectors && embedResult.vectors[0]) {
            targetEmb = await incidentEmbeddingDao.upsert({
              incidentId: targetObjId,
              organizationId: orgObjId,
              vector: embedResult.vectors[0],
              model: embedResult.model,
              provider: embedResult.provider,
              dim: embedResult.dim,
              textHash: prep.textHash,
            });
          }
        } catch {
          // If embedding provider is down or fails, fail-open cleanly
          return {
            available: false,
            reason: "Embedding provider is unavailable or target embedding not generated",
            similarIncidents: [],
          };
        }
      }

      if (!targetEmb || !targetEmb.vector || targetEmb.vector.length === 0) {
        return {
          available: false,
          reason: "Embeddings unavailable for this incident",
          similarIncidents: [],
        };
      }

      // 3. Find candidate PAST incidents (RESOLVED or CLOSED) in the same organization
      const pastIncidents = await Incident.find({
        organizationId: orgObjId,
        _id: { $ne: targetObjId },
        status: { $in: [INCIDENT_STATUS.RESOLVED, INCIDENT_STATUS.CLOSED] },
      })
        .populate<{ serviceId: { _id: Types.ObjectId; name: string } | null }>("serviceId", "name")
        .select("_id title status priority finalSeverity serviceId description ai resolvedAt")
        .lean()
        .exec();

      if (pastIncidents.length === 0) {
        return { available: true, similarIncidents: [] };
      }

      // 4. Retrieve candidate embeddings
      const pastIncidentIds = pastIncidents.map((p) => p._id);
      const candidateEmbeddings = await IncidentEmbedding.find({
        incidentId: { $in: pastIncidentIds },
        organizationId: orgObjId,
      }).lean().exec();

      if (candidateEmbeddings.length === 0) {
        return { available: true, similarIncidents: [] };
      }

      const embMap = new Map<string, number[]>();
      for (const ce of candidateEmbeddings) {
        embMap.set(ce.incidentId.toString(), ce.vector);
      }

      const targetServiceIdStr = targetIncident.serviceId ? targetIncident.serviceId.toString() : null;

      // 5. Calculate similarity scores and apply same-service boost
      const scored: SimilarIncidentItem[] = [];

      for (const past of pastIncidents) {
        const pastIdStr = past._id.toString();
        const vector = embMap.get(pastIdStr);
        if (!vector) continue;

        const rawSim = cosineSimilarity(targetEmb.vector, vector);

        // Check for same-service match
        const candServiceIdStr = past.serviceId
          ? (typeof past.serviceId === "object" && "_id" in past.serviceId
              ? (past.serviceId as { _id: Types.ObjectId })._id.toString()
              : past.serviceId.toString())
          : null;

        const isSameService = Boolean(targetServiceIdStr && candServiceIdStr && targetServiceIdStr === candServiceIdStr);
        const finalScore = isSameService ? Math.min(1.0, rawSim + boostSameService) : rawSim;

        if (finalScore >= minThreshold) {
          const serviceName = past.serviceId && typeof past.serviceId === "object" && "name" in past.serviceId
            ? (past.serviceId as { name: string }).name
            : null;

          scored.push({
            incidentId: pastIdStr,
            title: past.title,
            service: serviceName,
            finalSeverity: past.finalSeverity || past.priority,
            resolutionNotes: past.ai?.summary || past.description.slice(0, 200),
            similarityScore: Math.round(finalScore * 100) / 100,
            link: `/incidents/${pastIdStr}`,
          });
        }
      }

      // 6. Sort descending by similarityScore and take top `limit`
      scored.sort((a, b) => b.similarityScore - a.similarityScore);

      return {
        available: true,
        similarIncidents: scored.slice(0, limit),
      };
    } catch {
      // Hard Rule #2: App must work fully if embedding provider or vector calculation is down
      return {
        available: false,
        reason: "Similar incidents search encountered an internal error",
        similarIncidents: [],
      };
    }
  }

  /**
   * FR-06: Duplicate Detection
   * Evaluates likely duplicates among OPEN incidents:
   * 1. Similarity above configurable threshold (AI_DUPLICATE_THRESHOLD, default 0.70)
   * 2. Same service (or both without service)
   * 3. Within configurable time window (AI_DUPLICATE_WINDOW_HOURS, default 24h)
   * Stores as an AI suggestion with type: 'duplicate'.
   * Zero mutations / zero auto-merging (Hard Rule #1).
   */
  async detectDuplicates(
    incidentId: string | Types.ObjectId,
    organizationId: string | Types.ObjectId
  ): Promise<IAiSuggestion | null> {
    try {
      const targetObjId = new Types.ObjectId(incidentId);
      const orgObjId = new Types.ObjectId(organizationId);

      const targetIncident = await Incident.findOne({
        _id: targetObjId,
        organizationId: orgObjId,
      }).lean().exec();

      if (!targetIncident) return null;

      // Duplicate detection is only evaluated for active open/in-progress incidents
      if (
        targetIncident.status !== INCIDENT_STATUS.OPEN &&
        targetIncident.status !== INCIDENT_STATUS.IN_PROGRESS
      ) {
        return null;
      }

      // 1. Fetch target incident embedding
      let targetEmb = await incidentEmbeddingDao.findByIncidentId(targetObjId);
      if (!targetEmb || !targetEmb.vector || targetEmb.vector.length === 0) {
        // Fallback: compute embedding on demand if missing
        try {
          const provider = getEmbeddingProvider();
          let serviceName: string | null = null;
          if (targetIncident.serviceId) {
            const svc = await serviceDao.findByOrgAndId(orgObjId, targetIncident.serviceId);
            serviceName = svc?.name || null;
          }

          const prep = buildIncidentEmbeddingText({
            title: targetIncident.title,
            serviceName,
            description: targetIncident.description,
            resolutionNotes: targetIncident.ai?.summary || null,
          });

          const embedResult = await provider.embed([prep.text]);
          if (embedResult.vectors && embedResult.vectors[0]) {
            targetEmb = await incidentEmbeddingDao.upsert({
              incidentId: targetObjId,
              organizationId: orgObjId,
              vector: embedResult.vectors[0],
              model: embedResult.model,
              provider: embedResult.provider,
              dim: embedResult.dim,
              textHash: prep.textHash,
            });
          }
        } catch {
          return null; // Fail-open
        }
      }

      if (!targetEmb || !targetEmb.vector || targetEmb.vector.length === 0) {
        return null;
      }

      // 2. Query OPEN / IN_PROGRESS incidents within time window
      const windowHours = config.AI_DUPLICATE_WINDOW_HOURS || 24;
      const windowCutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000);

      const query: Record<string, unknown> = {
        organizationId: orgObjId,
        _id: { $ne: targetObjId },
        status: { $in: [INCIDENT_STATUS.OPEN, INCIDENT_STATUS.IN_PROGRESS] },
        createdAt: { $gte: windowCutoff },
      };

      // Service filter: same service
      if (targetIncident.serviceId) {
        query.serviceId = targetIncident.serviceId;
      }

      const candidateIncidents = await Incident.find(query)
        .populate<{ serviceId: { _id: Types.ObjectId; name: string } | null }>("serviceId", "name")
        .select("_id title status priority serviceId description createdAt")
        .lean()
        .exec();

      if (candidateIncidents.length === 0) {
        return null;
      }

      // 3. Fetch candidate embeddings
      const candidateIds = candidateIncidents.map((c) => c._id);
      const candidateEmbeddings = await IncidentEmbedding.find({
        incidentId: { $in: candidateIds },
        organizationId: orgObjId,
      }).lean().exec();

      if (candidateEmbeddings.length === 0) {
        return null;
      }

      const embMap = new Map<string, number[]>();
      for (const ce of candidateEmbeddings) {
        embMap.set(ce.incidentId.toString(), ce.vector);
      }

      // 4. Score candidates
      const threshold = config.AI_DUPLICATE_THRESHOLD || 0.70;
      const matches: Array<{
        incidentId: string;
        title: string;
        similarityScore: number;
        reason: string;
      }> = [];

      for (const candidate of candidateIncidents) {
        const candIdStr = candidate._id.toString();
        const vector = embMap.get(candIdStr);
        if (!vector) continue;

        const similarity = cosineSimilarity(targetEmb.vector, vector);
        if (similarity >= threshold) {
          const roundedScore = Math.round(similarity * 100) / 100;
          matches.push({
            incidentId: candIdStr,
            title: candidate.title,
            similarityScore: roundedScore,
            reason: `High semantic similarity (${Math.round(roundedScore * 100)}%) on same service created within the last ${windowHours} hours.`,
          });
        }
      }

      if (matches.length === 0) {
        return null;
      }

      // Sort descending by score
      matches.sort((a, b) => b.similarityScore - a.similarityScore);
      const bestMatch = matches[0];

      // 5. Store as AI suggestion (type: duplicate)
      const inputHash = hashInput(
        `duplicate::${targetObjId.toString()}::${bestMatch.incidentId}::${bestMatch.similarityScore}`
      );

      const suggestion = await aiSuggestionDao.create({
        incidentId: targetObjId.toString(),
        organizationId: orgObjId.toString(),
        type: AI_SUGGESTION_TYPE.DUPLICATE,
        inputHash,
        output: {
          candidateIncidentIds: matches.map((m) => m.incidentId),
          bestMatchIncidentId: bestMatch.incidentId,
          bestMatchTitle: bestMatch.title,
          bestMatchScore: bestMatch.similarityScore,
          reason: bestMatch.reason,
          matches,
        },
        model: targetEmb.model || "embeddings",
        provider: targetEmb.provider || "embeddings",
      });

      return suggestion;
    } catch {
      return null; // Fail-open
    }
  }
}

export const aiService = new AiService();
export default aiService;
