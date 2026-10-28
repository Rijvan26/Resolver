import { Request, Response, NextFunction } from "express";
import { dashboardService } from "../services/dashboardService";
import { ApiSuccessResponse } from "../types";
import { DateRangeQueryInput, RecentActivityQueryInput } from "../validations/dashboardValidation";

export class DashboardController {
  /**
   * GET /api/v1/dashboard/overview
   */
  async getOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user!.organizationId;
      const query = req.query as unknown as DateRangeQueryInput;

      const data = await dashboardService.getOverview(orgId, query);

      const response: ApiSuccessResponse<typeof data> = {
        success: true,
        message: "Dashboard overview retrieved successfully",
        data,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/dashboard/incidents-by-status
   */
  async getIncidentsByStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user!.organizationId;
      const query = req.query as unknown as DateRangeQueryInput;

      const data = await dashboardService.getIncidentsByStatus(orgId, query);

      const response: ApiSuccessResponse<typeof data> = {
        success: true,
        message: "Status distribution retrieved successfully",
        data,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/dashboard/incidents-by-priority
   */
  async getIncidentsByPriority(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user!.organizationId;
      const query = req.query as unknown as DateRangeQueryInput;

      const data = await dashboardService.getIncidentsByPriority(orgId, query);

      const response: ApiSuccessResponse<typeof data> = {
        success: true,
        message: "Priority distribution retrieved successfully",
        data,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/dashboard/incident-trends
   */
  async getIncidentTrends(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user!.organizationId;
      const query = req.query as unknown as DateRangeQueryInput;

      const data = await dashboardService.getIncidentTrends(orgId, query);

      const response: ApiSuccessResponse<typeof data> = {
        success: true,
        message: "Incident trends retrieved successfully",
        data,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/dashboard/team-workload
   */
  async getTeamWorkload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user!.organizationId;

      const data = await dashboardService.getTeamWorkload(orgId);

      const response: ApiSuccessResponse<typeof data> = {
        success: true,
        message: "Team workload retrieved successfully",
        data,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/dashboard/recent-activity
   */
  async getRecentActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user!.organizationId;
      const query = req.query as unknown as RecentActivityQueryInput;

      const data = await dashboardService.getRecentActivity(orgId, query);

      const response: ApiSuccessResponse<typeof data> = {
        success: true,
        message: "Recent activity retrieved successfully",
        data,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const dashboardController = new DashboardController();
export default dashboardController;

