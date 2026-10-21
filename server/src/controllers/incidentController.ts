import { Request, Response, NextFunction } from "express";
import { incidentService } from "../services/incidentService";
import { activityService } from "../services/activityService";
import { ListIncidentsQueryInput } from "../validations/incidentValidation";
import { ListTimelineQueryInput } from "../validations/activityValidation";
import { ApiSuccessResponse } from "../types";

export class IncidentController {
  /**
   * POST /api/v1/incidents
   * Create a new incident.
   */
  async createIncident(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await incidentService.createIncident(
        req.user!.organizationId,
        req.user!.userId,
        req.body
      );

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        message: "Incident created successfully",
        data: result,
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/incidents
   * List incidents with filtering, search, pagination, and sorting.
   */
  async listIncidents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await incidentService.listIncidents(
        req.user!.organizationId,
        req.query as unknown as ListIncidentsQueryInput
      );

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
   * GET /api/v1/incidents/:incidentId
   * Retrieve a single incident by ID.
   */
  async getIncident(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawId = req.params.incidentId;
      const incidentId = Array.isArray(rawId) ? rawId[0] : rawId;
      const result = await incidentService.getIncident(
        req.user!.organizationId,
        incidentId
      );

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
   * PATCH /api/v1/incidents/:incidentId
   * Update incident details and status.
   */
  async updateIncident(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawId = req.params.incidentId;
      const incidentId = Array.isArray(rawId) ? rawId[0] : rawId;
      const result = await incidentService.updateIncident(
        req.user!.organizationId,
        incidentId,
        req.body,
        req.user!.userId
      );

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        message: "Incident updated successfully",
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/incidents/:incidentId/assignee
   * Assign or reassign an incident.
   */
  async updateAssignee(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawId = req.params.incidentId;
      const incidentId = Array.isArray(rawId) ? rawId[0] : rawId;
      const result = await incidentService.updateAssignee(
        req.user!.organizationId,
        incidentId,
        req.body.assigneeId,
        req.user!.userId
      );

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        message: "Incident assignee updated successfully",
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/incidents/:incidentId
   * Delete an incident (SUPER_ADMIN, ADMIN).
   */
  async deleteIncident(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawId = req.params.incidentId;
      const incidentId = Array.isArray(rawId) ? rawId[0] : rawId;
      await incidentService.deleteIncident(
        req.user!.organizationId,
        incidentId,
        req.user!.userId
      );

      const response: ApiSuccessResponse<null> = {
        success: true,
        message: "Incident deleted successfully",
        data: null,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/incidents/:incidentId/timeline
   * Retrieve the audit and activity timeline for an incident.
   */
  async getIncidentTimeline(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawId = req.params.incidentId;
      const incidentId = Array.isArray(rawId) ? rawId[0] : rawId;
      const result = await activityService.getIncidentTimeline(
        req.user!.organizationId,
        incidentId,
        req.query as unknown as ListTimelineQueryInput
      );

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const incidentController = new IncidentController();
export default incidentController;
