import { Request, Response, NextFunction } from "express";
import { commentService } from "../services/commentService";
import { ListCommentsQueryInput } from "../validations/commentValidation";
import { ApiSuccessResponse } from "../types";

export class CommentController {
  /**
   * POST /api/v1/incidents/:incidentId/comments
   * Add a comment to an incident.
   */
  async createComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawIncidentId = req.params.incidentId;
      const incidentId = Array.isArray(rawIncidentId) ? rawIncidentId[0] : rawIncidentId;

      const result = await commentService.createComment(
        req.user!.organizationId,
        req.user!.userId,
        incidentId,
        req.body
      );

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        message: "Comment added successfully",
        data: result,
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/incidents/:incidentId/comments
   * List comments for an incident with pagination.
   */
  async listComments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawIncidentId = req.params.incidentId;
      const incidentId = Array.isArray(rawIncidentId) ? rawIncidentId[0] : rawIncidentId;

      const result = await commentService.listComments(
        req.user!.organizationId,
        incidentId,
        req.query as unknown as ListCommentsQueryInput
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
   * PATCH /api/v1/incidents/:incidentId/comments/:commentId
   * Update a comment. (Only original author can edit content).
   */
  async updateComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawIncidentId = req.params.incidentId;
      const incidentId = Array.isArray(rawIncidentId) ? rawIncidentId[0] : rawIncidentId;

      const rawCommentId = req.params.commentId;
      const commentId = Array.isArray(rawCommentId) ? rawCommentId[0] : rawCommentId;

      const result = await commentService.updateComment(
        req.user!.organizationId,
        req.user!.userId,
        req.user!.role,
        incidentId,
        commentId,
        req.body
      );

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        message: "Comment updated successfully",
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/incidents/:incidentId/comments/:commentId
   * Delete a comment. (Author or SUPER_ADMIN/ADMIN).
   */
  async deleteComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawIncidentId = req.params.incidentId;
      const incidentId = Array.isArray(rawIncidentId) ? rawIncidentId[0] : rawIncidentId;

      const rawCommentId = req.params.commentId;
      const commentId = Array.isArray(rawCommentId) ? rawCommentId[0] : rawCommentId;

      await commentService.deleteComment(
        req.user!.organizationId,
        req.user!.userId,
        req.user!.role,
        incidentId,
        commentId
      );

      const response: ApiSuccessResponse<null> = {
        success: true,
        message: "Comment deleted successfully",
        data: null,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const commentController = new CommentController();
export default commentController;
