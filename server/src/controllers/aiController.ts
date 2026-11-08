import { Request, Response, NextFunction } from "express";
import { aiService } from "../services/ai/aiService";
import { incidentDao } from "../dao/incidentDao";
import {
  aiSuggestionDao,
  FindAuditLogsFilter,
  AuditLogPaginationOptions,
} from "../dao/aiSuggestionDao";
import { addAiJob } from "../services/ai/queue/bullmq";
import { config } from "../config/config";
import {
  AI_SUGGESTION_TYPE,
  AI_USER_DECISION,
  INCIDENT_STATUS,
  INCIDENT_PRIORITY_UPDATE_ROLES,
  ApiSuccessResponse,
} from "../types";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { ListAuditLogQueryInput } from "../validations/aiValidation";

export class AiController {
  /**
   * POST /api/v1/incidents/:id/ai/triage
   * Trigger AI triage for an incident (asynchronous via queue, with synchronous fail-open fallback).
   */
  async triggerTriage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const incidentId = (req.params.incidentId || req.params.id) as string;
      const organizationId = req.user!.organizationId;
      const alert = req.body?.alert;

      const incident = await incidentDao.findByOrgAndId(organizationId, incidentId);
      if (!incident) {
        throw new NotFoundError("Incident not found");
      }

      // If sync mode requested or in test mode, execute directly
      const runSync = req.query.sync === "true" || config.NODE_ENV === "test";

      if (!runSync) {
        const jobId = await addAiJob({
          jobType: "triage",
          incidentId,
          organizationId,
          alert,
        });

        if (jobId) {
          const response: ApiSuccessResponse<{ jobId: string; queued: boolean }> = {
            success: true,
            message: "Triage job queued successfully",
            data: { jobId, queued: true },
          };
          res.status(202).json(response);
          return;
        }
      }

      // Fail-open fallback: execute directly via aiService
      const suggestion = await aiService.generateTriage(incidentId, organizationId, alert);

      const response: ApiSuccessResponse<typeof suggestion> = {
        success: true,
        message: suggestion ? "Triage suggestion generated" : "Triage evaluated (AI unavailable or inconclusive)",
        data: suggestion,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/incidents/:id/ai/summary
   * Trigger AI status summary generation for responders joining an incident.
   */
  async triggerSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const incidentId = (req.params.incidentId || req.params.id) as string;
      const organizationId = req.user!.organizationId;
      const userId = req.user!.userId;

      const incident = await incidentDao.findByOrgAndId(organizationId, incidentId);
      if (!incident) {
        throw new NotFoundError("Incident not found");
      }

      const runSync = req.query.sync === "true" || config.NODE_ENV === "test";

      if (!runSync) {
        const jobId = await addAiJob({
          jobType: "summary",
          incidentId,
          organizationId,
        });

        if (jobId) {
          const response: ApiSuccessResponse<{ jobId: string; queued: boolean }> = {
            success: true,
            message: "Summary job queued successfully",
            data: { jobId, queued: true },
          };
          res.status(202).json(response);
          return;
        }
      }

      const suggestion = await aiService.generateSummary(incidentId, organizationId, userId);

      const response: ApiSuccessResponse<typeof suggestion> = {
        success: true,
        message: suggestion ? "Summary generated successfully" : "AI summary unavailable",
        data: suggestion,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/incidents/:id/ai/postmortem
   * Trigger AI postmortem draft generation.
   * STRICT RESOLUTION GUARD: Only allowed for resolved or closed incidents.
   */
  async triggerPostmortem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const incidentId = (req.params.incidentId || req.params.id) as string;
      const organizationId = req.user!.organizationId;
      const userId = req.user!.userId;

      const incident = await incidentDao.findByOrgAndId(organizationId, incidentId);
      if (!incident) {
        throw new NotFoundError("Incident not found");
      }

      if (
        incident.status !== INCIDENT_STATUS.RESOLVED &&
        incident.status !== INCIDENT_STATUS.CLOSED
      ) {
        throw new ValidationError(
          `Postmortems can only be generated for resolved or closed incidents (current status: ${incident.status})`
        );
      }

      const runSync = req.query.sync === "true" || config.NODE_ENV === "test";

      if (!runSync) {
        const jobId = await addAiJob({
          jobType: "postmortem",
          incidentId,
          organizationId,
        });

        if (jobId) {
          const response: ApiSuccessResponse<{ jobId: string; queued: boolean }> = {
            success: true,
            message: "Postmortem draft job queued successfully",
            data: { jobId, queued: true },
          };
          res.status(202).json(response);
          return;
        }
      }

      const suggestion = await aiService.generatePostmortem(incidentId, organizationId, userId);

      const response: ApiSuccessResponse<typeof suggestion> = {
        success: true,
        message: suggestion ? "Postmortem draft generated successfully" : "AI postmortem unavailable",
        data: suggestion,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/incidents/:id/ai
   * Retrieve active AI state and latest suggestions for an incident.
   */
  async getIncidentAiStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const incidentId = (req.params.incidentId || req.params.id) as string;
      const organizationId = req.user!.organizationId;

      const result = await aiService.getIncidentAiStatus(incidentId, organizationId);

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/ai/suggestions/:id/decision
   * Record human-in-the-loop decision (Accept, Edit, Dismiss).
   * RBAC: Accepting or editing triage severity requires INCIDENT_PRIORITY_UPDATE_ROLES.
   */
  async recordDecision(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const suggestionId = (req.params.suggestionId || req.params.id) as string;
      const organizationId = req.user!.organizationId;
      const userId = req.user!.userId;
      const userRole = req.user!.role;
      const { decision, editedOutput } = req.body;

      const suggestion = await aiSuggestionDao.findByOrgAndId(organizationId, suggestionId);
      if (!suggestion) {
        throw new NotFoundError("AI suggestion not found");
      }

      // RBAC CHECK: Modifying incident severity requires appropriate role
      if (
        suggestion.type === AI_SUGGESTION_TYPE.TRIAGE &&
        (decision === AI_USER_DECISION.ACCEPTED || decision === AI_USER_DECISION.EDITED)
      ) {
        if (!INCIDENT_PRIORITY_UPDATE_ROLES.includes(userRole)) {
          throw new ForbiddenError(
            "Access denied: Only Managers, Admins, or Super Admins can accept or edit incident severity"
          );
        }
      }

      const updated = await aiService.recordDecision(
        suggestionId,
        organizationId,
        userId,
        decision,
        editedOutput
      );

      const response: ApiSuccessResponse<typeof updated> = {
        success: true,
        message: `Suggestion decision recorded as ${decision}`,
        data: updated,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/ai/audit
   * Retrieve paginated AI audit suggestions and operational telemetry metrics (FR-14).
   * RBAC: Restricted to SUPER_ADMIN and ADMIN.
   */
  async getAuditLog(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.user!.organizationId;
      const query = req.query as unknown as ListAuditLogQueryInput;

      const filter: FindAuditLogsFilter = {
        type: query.type,
        userDecision: query.decision,
        startDate: query.startDate,
        endDate: query.endDate,
      };

      const pagination: AuditLogPaginationOptions = {
        page: query.page,
        limit: query.limit,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      };

      const [logs, metrics] = await Promise.all([
        aiSuggestionDao.findAuditLogs(organizationId, filter, pagination),
        aiSuggestionDao.getAuditMetrics(organizationId, filter),
      ]);

      const response: ApiSuccessResponse<{
        suggestions: typeof logs.suggestions;
        pagination: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
        metrics: typeof metrics;
      }> = {
        success: true,
        data: {
          suggestions: logs.suggestions,
          pagination: {
            page: logs.page,
            limit: logs.limit,
            total: logs.total,
            totalPages: logs.totalPages,
          },
          metrics,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/incidents/:id/ai/similar
   * Return top 3 similar past resolved/closed incidents.
   * If embeddings are missing or provider down, returns { available: false, similarIncidents: [] }.
   * No LLM call needed.
   */
  async getSimilarIncidents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const incidentId = (req.params.incidentId || req.params.id) as string;
      const organizationId = req.user!.organizationId;

      const incident = await incidentDao.findByOrgAndId(organizationId, incidentId);
      if (!incident) {
        throw new NotFoundError("Incident not found");
      }

      const result = await aiService.findSimilarIncidents(incidentId, organizationId);

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        message: result.available
          ? "Similar incidents retrieved successfully"
          : "Similar incidents unavailable",
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/reports/ai/clarify
   * Evaluates draft report vagueness using cheap rules first; calls LLM only if vague.
   * Rate limited per user. Returns { vague: boolean, questions: string[] }.
   */
  async clarifyReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { title, description, serviceId } = req.body;
      const organizationId = req.user!.organizationId;
      const userId = req.user!.userId;

      const result = await aiService.clarifyReport({
        title: title || "",
        description: description || "",
        serviceId,
        organizationId,
        userId,
      });

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        message: result.vague
          ? "Report clarification suggestions generated"
          : "Report is adequately detailed",
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/incidents/:id/ai/status-draft
   * Generate status update draft for 'internal' or 'customer' audience.
   * Dispatches via BullMQ queue (or runs synchronously in test/sync mode).
   * Drafts are NEVER sent automatically (Hard Rule #1).
   */
  async triggerStatusDraft(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const incidentId = (req.params.incidentId || req.params.id) as string;
      const organizationId = req.user!.organizationId;
      const audience = (req.body?.audience || "internal") as "internal" | "customer";

      const incident = await incidentDao.findByOrgAndId(organizationId, incidentId);
      if (!incident) {
        throw new NotFoundError("Incident not found");
      }

      const runSync = req.query.sync === "true" || config.NODE_ENV === "test";

      if (!runSync) {
        const jobId = await addAiJob({
          jobType: "statusDraft",
          incidentId,
          organizationId,
          audience,
        });

        if (jobId) {
          const response: ApiSuccessResponse<{ jobId: string; queued: boolean }> = {
            success: true,
            message: "Status draft job queued successfully",
            data: { jobId, queued: true },
          };
          res.status(202).json(response);
          return;
        }
      }

      // Synchronous execution / fail-open fallback
      const suggestion = await aiService.generateStatusDraft(incidentId, organizationId, audience);

      const response: ApiSuccessResponse<typeof suggestion> = {
        success: true,
        message: suggestion ? "Status draft generated" : "Status draft unavailable (AI disabled)",
        data: suggestion,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const aiController = new AiController();
export default aiController;

