import { Request, Response, NextFunction } from "express";
import { alertService } from "../services/alertService";
import { Service } from "../models/Service";
import { ValidationError } from "../utils/errors";

export class AlertController {
  /**
   * Ingest an alert (POST /api/v1/alerts and POST /api/v1/alerts/ingest)
   */
  async ingestAlert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      let organizationId = req.user?.organizationId;
      const userId = req.user?.userId;

      // If webhook authentication was used (shared secret / HMAC) without a user session,
      // resolve organizationId from the referenced serviceId or body
      if (!organizationId && req.body.serviceId) {
        const service = await Service.findById(req.body.serviceId).exec();
        if (service) {
          organizationId = service.organizationId.toString();
        }
      }

      if (!organizationId) {
        throw new ValidationError("Referenced service was not found or organization could not be determined");
      }

      const result = await alertService.ingestAlert(organizationId, req.body, userId);

      res.status(201).json({
        success: true,
        message: result.grouped
          ? "Alert ingested and grouped successfully"
          : "Alert ingested and flagged for review",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all grouped and suggested alerts for an incident (GET /api/v1/incidents/:id/alerts)
   */
  async getIncidentAlerts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.user!.organizationId;
      const incidentId = (req.params.incidentId || req.params.id) as string;

      const result = await alertService.getIncidentAlerts(incidentId, organizationId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Record human decision (Accept/Dismiss) on an alert group suggestion
   * (POST /api/v1/incidents/:id/alerts/:alertId/decision)
   */
  async recordGroupDecision(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.user!.organizationId;
      const incidentId = (req.params.incidentId || req.params.id) as string;
      const alertId = req.params.alertId as string;
      const userId = req.user!.userId;
      const decision = req.body.decision as "accept" | "dismiss";

      const result = await alertService.handleGroupDecision(
        incidentId,
        alertId,
        organizationId,
        decision,
        userId
      );

      res.status(200).json({
        success: true,
        message: decision === "accept" ? "Alert grouped into incident" : "Alert dismissed and separate incident created",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const alertController = new AlertController();
export default alertController;
