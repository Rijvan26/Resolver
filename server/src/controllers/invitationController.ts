import { Request, Response, NextFunction } from "express";
import { invitationService } from "../services/invitationService";
import { ApiSuccessResponse, InvitationStatus } from "../types";

export class InvitationController {
  /**
   * POST /api/v1/invitations
   * Create and send a new organization member invitation.
   */
  async createInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await invitationService.createInvitation(
        req.user!.organizationId,
        req.user!.userId,
        req.user!.role,
        req.body
      );

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        message: "Invitation sent successfully",
        data: result,
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/invitations
   * List all invitations for the authenticated user's organization.
   */
  async listInvitations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = req.query.status as InvitationStatus | undefined;
      const result = await invitationService.listInvitations(
        req.user!.organizationId,
        status
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
   * POST /api/v1/invitations/accept
   * Public onboarding endpoint: accepts a valid invitation token and provisions the account.
   */
  async acceptInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await invitationService.acceptInvitation(req.body);

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        message: "Invitation accepted and account created successfully",
        data: result,
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/invitations/:invitationId
   * Revoke an active pending invitation.
   */
  async revokeInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawId = req.params.invitationId;
      const invitationId = Array.isArray(rawId) ? rawId[0] : rawId;
      const result = await invitationService.revokeInvitation(
        invitationId,
        req.user!.organizationId
      );

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        message: "Invitation revoked successfully",
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const invitationController = new InvitationController();
export default invitationController;
