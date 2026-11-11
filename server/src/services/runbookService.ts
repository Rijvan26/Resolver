import crypto from "crypto";
import { Types } from "mongoose";
import { config } from "../config/config";
import { runbookDao } from "../dao/runbookDao";
import { incidentDao } from "../dao/incidentDao";
import { serviceDao } from "../dao/serviceDao";
import { aiSuggestionDao } from "../dao/aiSuggestionDao";
import { IRunbook } from "../models/Runbook";
import { getEmbeddingProvider } from "./ai/embeddings";
import { cosineSimilarity } from "./ai/embeddings/cosineSimilarity";
import { getAiProvider } from "./ai/providers";
import { redact } from "./ai/redaction";
import { PROMPTS, runbookExplanationSchema } from "./ai/prompts";
import {
  AI_SUGGESTION_TYPE,
  AI_USER_DECISION,
  RunbookSuggestionsResult,
  SuggestedRunbookItem,
} from "../types";
import { NotFoundError } from "../utils/errors";

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "are", "was", "were",
  "has", "have", "had", "out", "all", "not", "but", "into", "can", "could",
  "under", "over", "api", "service", "error", "failed", "failing",
]);

/**
 * Tokenizes text into distinctive keywords for ranking
 */
function extractTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

export class RunbookService {
  /**
   * Suggest runbooks for an incident (FR-11):
   * 1. Retrieval first (No LLM): Matches runbooks from Service.runbookLinks + Runbook collection.
   *    Ranks by: same service (+0.40), tag/keyword match (+0.35 max), embedding similarity (+0.25 max).
   * 2. Returns top 3 with explanation reason for each match.
   * 3. Optional LLM step (off by default): generates a short "why this runbook" explanation using only facts.
   * 4. Logs suggestion to ai_suggestions.
   */
  async suggestRunbooks(
    incidentId: string,
    organizationId: string
  ): Promise<RunbookSuggestionsResult> {
    const start = performance.now();

    // Check feature toggle
    if (!config.AI_RUNBOOK_ENABLED) {
      return {
        aiAvailable: false,
        reason: "disabled",
        runbooks: [],
      };
    }

    const orgId = new Types.ObjectId(organizationId);
    const incident = await incidentDao.findByOrgAndId(organizationId, incidentId);
    if (!incident) {
      throw new NotFoundError("Incident not found");
    }

    // 1. Gather candidate runbooks: from Runbook collection + Service.runbookLinks
    const orgRunbooks = await runbookDao.findByOrg(orgId);
    const candidateMap = new Map<string, {
      id?: string;
      title: string;
      url: string;
      tags: string[];
      serviceId?: Types.ObjectId | null;
      description?: string;
    }>();

    // Add stored runbooks
    orgRunbooks.forEach((rb) => {
      candidateMap.set(rb.url.trim().toLowerCase(), {
        id: rb._id.toString(),
        title: rb.title,
        url: rb.url,
        tags: rb.tags || [],
        serviceId: rb.serviceId,
        description: rb.description || "",
      });
    });

    // Add Service.runbookLinks if present
    let serviceName = "";
    if (incident.serviceId) {
      const rawServiceId = (incident.serviceId as any)._id
        ? (incident.serviceId as any)._id.toString()
        : String(incident.serviceId);
      const service = await serviceDao.findByOrgAndId(organizationId, rawServiceId);
      if (service) {
        serviceName = service.name;
        if (service.runbookLinks && service.runbookLinks.length > 0) {
          service.runbookLinks.forEach((link, idx) => {
            const key = link.trim().toLowerCase();
            if (!candidateMap.has(key)) {
              candidateMap.set(key, {
                title: `${service.name} Runbook${service.runbookLinks.length > 1 ? ` #${idx + 1}` : ""}`,
                url: link,
                tags: [service.name.toLowerCase(), "service-runbook"],
                serviceId: service._id,
                description: `Standard operating procedure for ${service.name}`,
              });
            }
          });
        }
      }
    }

    const candidates = Array.from(candidateMap.values());
    if (candidates.length === 0) {
      return {
        aiAvailable: true,
        runbooks: [],
      };
    }

    // 2. Score and Rank candidates (cheapest first)
    const incidentTokens = new Set([
      ...extractTokens(incident.title),
      ...extractTokens(incident.description),
    ]);

    // Compute embeddings if AI is enabled and candidates exist (Fail-open)
    let candidateEmbeddings: number[][] = [];
    let incidentVector: number[] | null = null;

    if (config.AI_ENABLED) {
      try {
        const embeddingProvider = getEmbeddingProvider();
        const alertText = `${incident.title}. ${incident.description}`;
        const embedResult = await embeddingProvider.embed([alertText]);
        incidentVector = embedResult.vectors[0] || null;

        if (incidentVector) {
          const candidateTexts = candidates.map(
            (c) => `${c.title}. ${c.tags.join(" ")} ${c.description || ""}`
          );
          const cEmbedResult = await embeddingProvider.embed(candidateTexts);
          candidateEmbeddings = cEmbedResult.vectors;
        }
      } catch (err) {
        // Fail open: fallback gracefully to keyword + service scoring
        console.warn("⚠️ Runbook embedding computation failed (failing open):", err);
      }
    }

    const incidentServiceId = (incident.serviceId as any)?._id
      ? (incident.serviceId as any)._id.toString()
      : incident.serviceId
        ? incident.serviceId.toString()
        : null;

    const scoredCandidates: SuggestedRunbookItem[] = candidates.map((cand, idx) => {
      let score = 0;
      const reasons: string[] = [];

      // A. Same service match (+0.40)
      const candServiceId = (cand.serviceId as any)?._id
        ? (cand.serviceId as any)._id.toString()
        : cand.serviceId
          ? cand.serviceId.toString()
          : null;

      const isSameService =
        Boolean(incidentServiceId) &&
        Boolean(candServiceId) &&
        candServiceId === incidentServiceId;

      if (isSameService) {
        score += 0.40;
        reasons.push(
          serviceName
            ? `Directly linked to ${serviceName} service`
            : "Directly linked to incident service"
        );
      }

      // B. Tag and Keyword match (+0.35 max)
      const candTokens = [
        ...extractTokens(cand.title),
        ...cand.tags.map((t) => t.toLowerCase()),
        ...extractTokens(cand.description || ""),
      ];

      const matchingTokens = Array.from(new Set(candTokens.filter((t) => incidentTokens.has(t))));
      if (matchingTokens.length > 0) {
        const keywordScore = Math.min(0.35, matchingTokens.length * 0.12);
        score += keywordScore;
        reasons.push(`Matches tags/keywords: [${matchingTokens.slice(0, 3).join(", ")}]`);
      }

      // C. Embedding similarity (+0.25 max)
      if (incidentVector && candidateEmbeddings[idx]) {
        const sim = cosineSimilarity(incidentVector, candidateEmbeddings[idx]);
        if (sim > 0.4) {
          const embedScore = sim * 0.25;
          score += embedScore;
          if (reasons.length === 0) {
            reasons.push(`High semantic similarity (${(sim * 100).toFixed(0)}%) to failure description`);
          }
        }
      }

      const matchReason =
        reasons.length > 0
          ? reasons.join(" • ")
          : "General platform runbook for incident troubleshooting";

      return {
        id: cand.id,
        title: cand.title,
        url: cand.url,
        tags: cand.tags,
        serviceId: cand.serviceId ? cand.serviceId.toString() : null,
        score: Number(score.toFixed(4)),
        reason: matchReason,
        explanation: matchReason,
      };
    });

    // Sort descending by score, take top 3
    scoredCandidates.sort((a, b) => b.score - a.score);
    const topRunbooks = scoredCandidates.slice(0, 3);

    // 3. Optional LLM step (off by default): 1-sentence "why this runbook" using only facts
    if (config.AI_RUNBOOK_EXPLANATION_ENABLED && config.AI_ENABLED && topRunbooks.length > 0) {
      try {
        const provider = getAiProvider();
        for (const rb of topRunbooks) {
          const redactedTitle = redact(incident.title);
          const redactedDesc = redact(incident.description);

          const prompt = PROMPTS.runbook.user({
            title: redactedTitle,
            description: redactedDesc,
            serviceName,
            runbookTitle: rb.title,
            runbookTags: rb.tags,
          });

          const result = await provider.generateJson<runbookExplanationOutput>({
            prompt,
            system: PROMPTS.runbook.system,
            schema: runbookExplanationSchema,
            timeoutMs: 8000,
          });

          if (result.data?.explanation) {
            rb.explanation = result.data.explanation;
          }
        }
      } catch (err) {
        // Fail-open: keep deterministic retrieval reasons
        console.warn("⚠️ Optional LLM runbook explanation failed (failing open):", err);
      }
    }

    const latencyMs = Math.round(performance.now() - start);

    // 4. Log suggestion to ai_suggestions
    const suggestion = await aiSuggestionDao.create({
      incidentId: incident._id,
      organizationId: orgId,
      type: AI_SUGGESTION_TYPE.RUNBOOK,
      inputHash: crypto
        .createHash("sha256")
        .update(`${incident._id}:${topRunbooks.map((r) => r.url).join(";")}`)
        .digest("hex"),
      output: { runbooks: topRunbooks },
      model: config.AI_RUNBOOK_EXPLANATION_ENABLED ? config.AI_MODEL : "retrieval-rules",
      provider: config.AI_RUNBOOK_EXPLANATION_ENABLED ? config.AI_PROVIDER : "retrieval",
      latencyMs,
      status: "ready",
    });

    return {
      aiAvailable: true,
      suggestionId: suggestion._id.toString(),
      runbooks: topRunbooks,
    };
  }

  /**
   * Record human feedback on runbook suggestions (Useful / Not useful)
   */
  async recordFeedback(
    suggestionId: string,
    organizationId: string,
    feedback: "useful" | "not_useful",
    userId: string
  ): Promise<boolean> {
    const decision =
      feedback === "useful" ? AI_USER_DECISION.ACCEPTED : AI_USER_DECISION.DISMISSED;

    const updated = await aiSuggestionDao.updateDecisionByOrgAndId(
      organizationId,
      suggestionId,
      decision,
      userId
    );

    return updated !== null;
  }
}

type runbookExplanationOutput = {
  explanation: string;
};

export const runbookService = new RunbookService();
export default runbookService;
