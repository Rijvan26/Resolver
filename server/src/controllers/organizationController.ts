import { Request, Response, NextFunction } from "express";
import { organizationService } from "../services/organizationService";
import { ApiSuccessResponse } from "../types";

export class OrganizationController {
  /**
   * GET /api/v1/organizations/me
   * Retrieve authenticated user's organization profile.
   */
  async getOrganization(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await organizationService.getOrganization(req.user!.organizationId);

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
   * PATCH /api/v1/organizations/me
   * Update organization settings (SUPER_ADMIN, ADMIN).
   */
  async updateOrganization(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await organizationService.updateOrganization(
        req.user!.organizationId,
        req.body
      );

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        message: "Organization updated successfully",
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/organizations/me/members
   * List members within caller's organization with pagination, filtering, and search.
   */
  async listMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await organizationService.listMembers(
        req.user!.organizationId,
        req.query as any
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
   * GET /api/v1/organizations/me/members/:memberId
   * Retrieve details of a specific member within caller's organization.
   */
  async getMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawId = req.params.memberId;
      const memberId = Array.isArray(rawId) ? rawId[0] : rawId;
      const result = await organizationService.getMember(
        req.user!.organizationId,
        memberId
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
   * PATCH /api/v1/organizations/me/members/:memberId/role
   * Update member role.
   */
  async updateMemberRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawId = req.params.memberId;
      const memberId = Array.isArray(rawId) ? rawId[0] : rawId;
      const result = await organizationService.updateMemberRole(
        req.user!.organizationId,
        req.user!.userId,
        req.user!.role,
        memberId,
        req.body.role
      );

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        message: "Member role updated successfully",
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/organizations/me/members/:memberId/status
   * Update member active status (activate/deactivate).
   */
  async updateMemberStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawId = req.params.memberId;
      const memberId = Array.isArray(rawId) ? rawId[0] : rawId;
      const result = await organizationService.updateMemberStatus(
        req.user!.organizationId,
        req.user!.userId,
        req.user!.role,
        memberId,
        req.body.isActive
      );

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        message: "Member status updated successfully",
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const organizationController = new OrganizationController();
export default organizationController;
