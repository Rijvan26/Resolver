import crypto from "crypto";
import { Types } from "mongoose";
import { config } from "../config/config";
import { alertDao } from "../dao/alertDao";
import { incidentDao } from "../dao/incidentDao";
import { serviceDao } from "../dao/serviceDao";
import { aiSuggestionDao } from "../dao/aiSuggestionDao";
import { activityDao } from "../dao/activityDao";
import { User } from "../models/User";
import { AiSuggestion } from "../models/AiSuggestion";
import { IAlert } from "../models/Alert";
import { IIncident } from "../models/Incident";
import {
  ALERT_STATUS,
  AI_SUGGESTION_TYPE,
  AI_USER_DECISION,
  INCIDENT_STATUS,
  ACTIVITY_ACTION,
  IncidentPriority,
} from "../types";
import { NotFoundError, ValidationError } from "../utils/errors";
import { IngestAlertInput } from "../validations/alertValidation";
import { getEmbeddingProvider } from "./ai/embeddings";
import { cosineSimilarity } from "./ai/embeddings/cosineSimilarity";

export interface AlertIngestResult {
  alert: IAlert;
  grouped: boolean;
  incidentId?: Types.ObjectId | string;
  suggestedIncidentId?: Types.ObjectId | string;
  suggestionId?: Types.ObjectId | string;
  reviewRequired?: boolean;
  aiSuggested?: boolean;
  createdNewIncident?: boolean;
  floodCapped?: boolean;
  floodDropped?: boolean;
  reason?: string;
}

// In-memory sliding window flood protection tracker
const orgIncidentCreationTimestamps = new Map<string, number[]>();
let alertFloodDroppedCounter = 0;

export function getAlertFloodDroppedCount(): number {
  return alertFloodDroppedCounter;
}

export function resetAlertFloodTracker(): void {
  orgIncidentCreationTimestamps.clear();
  alertFloodDroppedCounter = 0;
}

export interface SuggestedAlertItem {
  alert: IAlert;
  suggestionId?: string;
  similarityScore?: number;
  reason?: string;
  isTier1Safeguard?: boolean;
}

export interface IncidentAlertsResult {
  incidentId: string;
  alertCount: number;
  groupedAlerts: IAlert[];
  suggestedAlerts: SuggestedAlertItem[];
}

export class AlertService {
  /**
   * Deterministically compute an alert fingerprint.
   * If a custom fingerprint is supplied by the monitoring agent, it is preserved.
   * Otherwise: SHA-256(serviceId:normalized_title).
   */
  computeFingerprint(serviceId: string, title: string, customFingerprint?: string): string {
    if (customFingerprint && customFingerprint.trim().length > 0) {
      return customFingerprint.trim();
    }
    const normalized = `${serviceId}:${title.trim().toLowerCase()}`;
    return crypto.createHash("sha256").update(normalized).digest("hex");
  }

  /**
   * Ingest and group an incoming alert (FR-08):
   * 1. Rule 1 (Plain code, no AI): Exact fingerprint match or exact same service + title within time window.
   *    - Tier-1 P1 safeguard: Never auto-group tier-1 P1 alerts silently; flags for human review instead.
   * 2. Rule 2 (AI, if enabled): Embedding similarity above threshold + same service within time window.
   *    - Only suggests grouping via ai_suggestion of type 'alert_group'.
   * 3. Fail-open: If Redis or embedding services fail or are disabled, the alert safely creates or joins an incident.
   */
  async ingestAlert(
    organizationId: string,
    payload: IngestAlertInput,
    userId?: string
  ): Promise<AlertIngestResult> {
    const orgId = new Types.ObjectId(organizationId);

    // 1. Verify referenced service exists
    const service = await serviceDao.findByOrgAndId(organizationId, payload.serviceId);
    if (!service) {
      throw new NotFoundError("Referenced service does not exist in this organization");
    }

    const fingerprint = this.computeFingerprint(
      payload.serviceId,
      payload.title,
      payload.fingerprint
    );

    const windowMinutes = config.AI_ALERT_GROUPING_WINDOW_MINUTES ?? 30;
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);

    // 2. Rule 1: Cheapest first (plain DB query)
    // Find open incidents for this service within the deduplication window
    const openIncidents = await incidentDao.findOpenByServiceAndWindow(
      organizationId,
      payload.serviceId,
      cutoff
    );

    // Check for an exact fingerprint match among recent alerts
    const recentAlertWithFingerprint = await alertDao.findRecentByFingerprint(
      organizationId,
      fingerprint,
      cutoff
    );

    let targetIncident: IIncident | null = null;

    if (recentAlertWithFingerprint && recentAlertWithFingerprint.incidentId) {
      const inc = await incidentDao.findByOrgAndId(
        organizationId,
        recentAlertWithFingerprint.incidentId
      );
      if (inc && (inc.status === INCIDENT_STATUS.OPEN || inc.status === INCIDENT_STATUS.IN_PROGRESS)) {
        targetIncident = inc;
      }
    }

    // If no fingerprint match on a previous alert, check if an open incident for this service has the exact same title
    if (!targetIncident && openIncidents.length > 0) {
      const exactTitleMatch = openIncidents.find(
        (inc) => inc.title.trim().toLowerCase() === payload.title.trim().toLowerCase()
      );
      if (exactTitleMatch) {
        targetIncident = exactTitleMatch;
      }
    }

    // Process Rule 1 Match if found
    if (targetIncident) {
      const isTier1 = service.tier === 1;
      const isCriticalOrP1 =
        payload.severity === "CRITICAL" || (payload.severity as string).toUpperCase() === "P1";

      // Tier-1 P1 Safeguard: Never silently auto-group tier-1 P1 alerts if it would hide a new failure mode
      if (isTier1 && isCriticalOrP1) {
        const alert = await alertDao.create({
          organizationId: orgId,
          serviceId: service._id,
          title: payload.title.trim(),
          description: payload.description.trim(),
          severity: payload.severity as IncidentPriority,
          source: payload.source || "custom",
          fingerprint,
          suggestedIncidentId: targetIncident._id,
          status: ALERT_STATUS.OPEN,
          metadata: payload.metadata || {},
        });

        // Store suggestion for human review
        const suggestion = await aiSuggestionDao.create({
          incidentId: targetIncident._id,
          organizationId: orgId,
          type: AI_SUGGESTION_TYPE.ALERT_GROUP,
          inputHash: crypto
            .createHash("sha256")
            .update(`${alert._id}:${fingerprint}:${Date.now()}`)
            .digest("hex"),
          output: {
            alertId: alert._id.toString(),
            alertTitle: alert.title,
            alertSeverity: alert.severity,
            alertSource: alert.source,
            confidence: 1.0,
            requiresReview: true,
            isTier1Safeguard: true,
            reason:
              "Tier-1 CRITICAL alert requires human review before grouping to prevent hiding new failure modes",
          },
          model: "rules-tier1-safeguard",
          provider: "rules",
          latencyMs: 1,
          status: "ready",
        });

        return {
          alert,
          grouped: false,
          reviewRequired: true,
          suggestedIncidentId: targetIncident._id,
          suggestionId: suggestion._id,
        };
      }

      // Exact match auto-grouping (plain code, no AI)
      const alert = await alertDao.create({
        organizationId: orgId,
        serviceId: service._id,
        title: payload.title.trim(),
        description: payload.description.trim(),
        severity: payload.severity as IncidentPriority,
        source: payload.source || "custom",
        fingerprint,
        incidentId: targetIncident._id,
        status: ALERT_STATUS.GROUPED,
        metadata: payload.metadata || {},
      });

      await incidentDao.incrementAlertCount(organizationId, targetIncident._id, 1);

      // Record activity
      const actorId = userId ? new Types.ObjectId(userId) : targetIncident.createdBy;
      await activityDao.create({
        organizationId: orgId,
        incidentId: targetIncident._id,
        actorId,
        action: ACTIVITY_ACTION.DETAILS_UPDATED,
        metadata: {
          field: "alerts",
          message: `Alert grouped automatically by fingerprint: "${payload.title}"`,
          alertId: alert._id,
          source: alert.source,
        },
      });

      return {
        alert,
        grouped: true,
        incidentId: targetIncident._id,
      };
    }

    // 3. Rule 2: Embedding similarity grouping (cheapest AI, only if enabled)
    const isAiEnabled = Boolean(config.AI_ENABLED);
    const isGroupingEnabled = Boolean(config.AI_ALERT_GROUPING_ENABLED);
    const threshold = config.AI_ALERT_GROUPING_SIMILARITY_THRESHOLD ?? 0.82;

    if (isAiEnabled && isGroupingEnabled && openIncidents.length > 0) {
      try {
        const start = performance.now();
        const embeddingProvider = getEmbeddingProvider();

        const alertText = `${payload.title}. ${payload.description}`;
        const alertEmbedResult = await embeddingProvider.embed([alertText]);
        const alertVector = alertEmbedResult.vectors[0];

        if (alertVector && alertVector.length > 0) {
          // Embed candidate open incidents
          const incidentTexts = openIncidents.map(
            (inc) => `${inc.title}. ${inc.description}`
          );
          const incEmbedResult = await embeddingProvider.embed(incidentTexts);

          let bestIncident: IIncident | null = null;
          let highestScore = -1;

          openIncidents.forEach((inc, idx) => {
            const vec = incEmbedResult.vectors[idx];
            if (vec && vec.length > 0) {
              const score = cosineSimilarity(alertVector, vec);
              if (score > highestScore) {
                highestScore = score;
                bestIncident = inc;
              }
            }
          });

          // Check against configured similarity threshold
          if (bestIncident && highestScore >= threshold) {
            const latencyMs = performance.now() - start;

            const alert = await alertDao.create({
              organizationId: orgId,
              serviceId: service._id,
              title: payload.title.trim(),
              description: payload.description.trim(),
              severity: payload.severity as IncidentPriority,
              source: payload.source || "custom",
              fingerprint,
              suggestedIncidentId: (bestIncident as IIncident)._id,
              status: ALERT_STATUS.OPEN,
              metadata: payload.metadata || {},
            });

            // Store as ai_suggestion type 'alert_group' (human decision required)
            const suggestion = await aiSuggestionDao.create({
              incidentId: (bestIncident as IIncident)._id,
              organizationId: orgId,
              type: AI_SUGGESTION_TYPE.ALERT_GROUP,
              inputHash: crypto
                .createHash("sha256")
                .update(`${alert._id}:${fingerprint}`)
                .digest("hex"),
              output: {
                alertId: alert._id.toString(),
                alertTitle: alert.title,
                alertSeverity: alert.severity,
                alertSource: alert.source,
                similarityScore: Number(highestScore.toFixed(4)),
                confidence: Number(highestScore.toFixed(4)),
                threshold,
                requiresReview: true,
                isTier1Safeguard: false,
                reason: `Semantic similarity (${(highestScore * 100).toFixed(0)}%) exceeds threshold (${(threshold * 100).toFixed(0)}%) for service ${service.name}`,
              },
              model: config.EMBEDDING_MODEL || "gemini-embedding-001",
              provider: config.EMBEDDING_PROVIDER || "fake",
              latencyMs: Math.round(latencyMs),
              status: "ready",
            });

            return {
              alert,
              grouped: false,
              aiSuggested: true,
              suggestedIncidentId: (bestIncident as IIncident)._id,
              suggestionId: suggestion._id,
            };
          }
        }
      } catch (err) {
        // Fail-open: If embedding provider fails or is offline, log and continue to incident creation
        console.warn("⚠️ Alert grouping embedding step failed (failing open):", err);
      }
    }

    // 4. Default: No grouping match or fail-open -> create a new incident (with Flood Protection)
    const floodCap = config.ALERT_FLOOD_INCIDENT_CAP ?? 10;
    const floodWindowMs = (config.ALERT_FLOOD_WINDOW_MINUTES ?? 10) * 60 * 1000;
    const now = Date.now();
    const timestamps = (orgIncidentCreationTimestamps.get(organizationId) || []).filter(
      (ts) => now - ts < floodWindowMs
    );

    if (timestamps.length >= floodCap) {
      // Alert flood detected: cap reached!
      // Strategy: Attach excess alerts to existing open incident if available, else drop with counter
      const candidateIncident = openIncidents[0] || (await incidentDao.findLatestOpenByOrg(organizationId));
      if (candidateIncident) {
        const floodAlert = await alertDao.create({
          organizationId: orgId,
          serviceId: service._id,
          title: payload.title.trim(),
          description: payload.description.trim(),
          severity: payload.severity as IncidentPriority,
          source: payload.source || "custom",
          fingerprint,
          incidentId: candidateIncident._id,
          status: ALERT_STATUS.GROUPED,
          metadata: {
            ...(payload.metadata || {}),
            floodCapped: true,
            floodReason: `Incident flood limit (${floodCap} per ${config.ALERT_FLOOD_WINDOW_MINUTES}m) reached`,
          },
        });

        await incidentDao.incrementAlertCount(organizationId, candidateIncident._id, 1);

        return {
          alert: floodAlert,
          grouped: true,
          incidentId: candidateIncident._id,
          createdNewIncident: false,
          floodCapped: true,
          reason: `Flood cap exceeded; attached to open incident ${candidateIncident._id}`,
        };
      }

      // No open incident exists -> drop with counter increment
      alertFloodDroppedCounter++;
      const droppedAlert = await alertDao.create({
        organizationId: orgId,
        serviceId: service._id,
        title: payload.title.trim(),
        description: payload.description.trim(),
        severity: payload.severity as IncidentPriority,
        source: payload.source || "custom",
        fingerprint,
        status: ALERT_STATUS.OPEN,
        metadata: {
          ...(payload.metadata || {}),
          floodDropped: true,
          floodReason: `Incident flood limit (${floodCap} per ${config.ALERT_FLOOD_WINDOW_MINUTES}m) reached; no open incident to attach`,
        },
      });

      return {
        alert: droppedAlert,
        grouped: false,
        createdNewIncident: false,
        floodDropped: true,
        reason: `Flood cap exceeded (${floodCap}); alert dropped`,
      };
    }

    // Normal incident creation -> record timestamp
    timestamps.push(now);
    orgIncidentCreationTimestamps.set(organizationId, timestamps);

    let creatorId: Types.ObjectId;
    if (userId) {
      creatorId = new Types.ObjectId(userId);
    } else {
      const activeUser = await User.findOne({ organizationId: orgId, isActive: true }).exec();
      creatorId = activeUser ? activeUser._id : new Types.ObjectId();
    }

    const newIncident = await incidentDao.create({
      title: payload.title.trim(),
      description: payload.description.trim(),
      priority: payload.severity as IncidentPriority,
      serviceId: service._id,
      organizationId: orgId,
      createdBy: creatorId,
      status: INCIDENT_STATUS.OPEN,
    });

    // Save alert attached to the newly created incident
    const alert = await alertDao.create({
      organizationId: orgId,
      serviceId: service._id,
      title: payload.title.trim(),
      description: payload.description.trim(),
      severity: payload.severity as IncidentPriority,
      source: payload.source || "custom",
      fingerprint,
      incidentId: newIncident._id,
      status: ALERT_STATUS.GROUPED,
      metadata: payload.metadata || {},
    });

    newIncident.alertCount = 1;
    await newIncident.save();

    return {
      alert,
      grouped: true,
      incidentId: newIncident._id,
      createdNewIncident: true,
    };
  }

  /**
   * Human decision on an AI-suggested alert group (Accept or Dismiss).
   * Nothing is grouped or altered without this explicit click.
   */
  async handleGroupDecision(
    incidentId: string,
    alertId: string,
    organizationId: string,
    decision: "accept" | "dismiss",
    userId: string
  ): Promise<{ success: boolean; alert: IAlert; separateIncidentId?: Types.ObjectId | string }> {
    const orgId = new Types.ObjectId(organizationId);
    const incId = new Types.ObjectId(incidentId);

    const incident = await incidentDao.findByOrgAndId(organizationId, incidentId);
    if (!incident) {
      throw new NotFoundError("Incident not found");
    }

    const alert = await alertDao.findByOrgAndId(organizationId, alertId);
    if (!alert) {
      throw new NotFoundError("Alert not found");
    }

    if (decision === "accept") {
      // Human confirmed: attach alert to existing incident
      alert.incidentId = incId;
      alert.suggestedIncidentId = null;
      alert.status = ALERT_STATUS.GROUPED;
      await alert.save();

      await incidentDao.incrementAlertCount(organizationId, incidentId, 1);

      // Mark matching ai_suggestion as accepted
      const pendingSuggestion = await AiSuggestion.findOne({
        incidentId: incId,
        organizationId: orgId,
        type: AI_SUGGESTION_TYPE.ALERT_GROUP,
        "output.alertId": alertId,
        userDecision: AI_USER_DECISION.PENDING,
      }).exec();

      if (pendingSuggestion) {
        await aiSuggestionDao.updateDecisionByOrgAndId(
          organizationId,
          pendingSuggestion._id,
          AI_USER_DECISION.ACCEPTED,
          userId
        );
      }

      await activityDao.create({
        organizationId: orgId,
        incidentId: incId,
        actorId: new Types.ObjectId(userId),
        action: ACTIVITY_ACTION.DETAILS_UPDATED,
        metadata: {
          field: "alerts",
          message: `Alert "${alert.title}" accepted and grouped by user`,
          alertId: alert._id,
        },
      });

      return { success: true, alert };
    } else {
      // Human dismissed: create standalone incident for the alert so it is not lost
      alert.suggestedIncidentId = null;
      alert.status = ALERT_STATUS.DISMISSED;
      await alert.save();

      // Mark suggestion as dismissed
      const pendingSuggestion = await AiSuggestion.findOne({
        incidentId: incId,
        organizationId: orgId,
        type: AI_SUGGESTION_TYPE.ALERT_GROUP,
        "output.alertId": alertId,
        userDecision: AI_USER_DECISION.PENDING,
      }).exec();

      if (pendingSuggestion) {
        await aiSuggestionDao.updateDecisionByOrgAndId(
          organizationId,
          pendingSuggestion._id,
          AI_USER_DECISION.DISMISSED,
          userId
        );
      }

      // Create a separate incident for the un-grouped alert
      const separateIncident = await incidentDao.create({
        title: alert.title,
        description: alert.description,
        priority: alert.severity,
        serviceId: alert.serviceId,
        organizationId: orgId,
        createdBy: new Types.ObjectId(userId),
        status: INCIDENT_STATUS.OPEN,
      });

      alert.incidentId = separateIncident._id;
      alert.status = ALERT_STATUS.GROUPED;
      await alert.save();

      return {
        success: true,
        alert,
        separateIncidentId: separateIncident._id,
      };
    }
  }

  /**
   * Retrieve all grouped alerts and pending suggested alerts for an incident.
   */
  async getIncidentAlerts(
    incidentId: string,
    organizationId: string
  ): Promise<IncidentAlertsResult> {
    const incId = new Types.ObjectId(incidentId);
    const orgId = new Types.ObjectId(organizationId);

    const incident = await incidentDao.findByOrgAndId(organizationId, incidentId);
    if (!incident) {
      throw new NotFoundError("Incident not found");
    }

    const groupedAlerts = await alertDao.findAlertsByIncident(organizationId, incidentId);
    const rawSuggestedAlerts = await alertDao.findSuggestedAlertsByIncident(
      organizationId,
      incidentId
    );

    // Fetch active suggestions to attach metadata (confidence, reason, suggestionId)
    const suggestions = await AiSuggestion.find({
      incidentId: incId,
      organizationId: orgId,
      type: AI_SUGGESTION_TYPE.ALERT_GROUP,
      userDecision: AI_USER_DECISION.PENDING,
    }).exec();

    const suggestedAlerts: SuggestedAlertItem[] = rawSuggestedAlerts.map((alert) => {
      const match = suggestions.find((s) => s.output?.alertId === alert._id.toString());
      return {
        alert,
        suggestionId: match?._id.toString(),
        similarityScore: match?.output?.similarityScore as number | undefined,
        reason: match?.output?.reason as string | undefined,
        isTier1Safeguard: match?.output?.isTier1Safeguard as boolean | undefined,
      };
    });

    return {
      incidentId,
      alertCount: groupedAlerts.length,
      groupedAlerts,
      suggestedAlerts,
    };
  }
}

export const alertService = new AlertService();
export default alertService;
