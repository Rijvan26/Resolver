import { Request, Response, NextFunction } from "express";
import { notificationService } from "../services/notificationService";
import { ListNotificationsQueryInput } from "../validations/notificationValidation";
import { ApiSuccessResponse } from "../types";

export class NotificationController {
  /**
   * GET /api/v1/notifications
   * List authenticated user's notifications with pagination and optional unread filtering.
   */
  async listNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.user!.organizationId;
      const recipientId = req.user!.userId;
      const query = req.query as unknown as ListNotificationsQueryInput;

      const result = await notificationService.listNotifications(
        organizationId,
        recipientId,
        query
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
   * GET /api/v1/notifications/unread-count
   * Return unread notifications count for authenticated user in caller's organization.
   */
  async getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.user!.organizationId;
      const recipientId = req.user!.userId;

      const result = await notificationService.getUnreadCount(
        organizationId,
        recipientId
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
   * PATCH /api/v1/notifications/:notificationId/read
   * Mark a single notification as read.
   */
  async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.user!.organizationId;
      const recipientId = req.user!.userId;
      const rawId = req.params.notificationId;
      const notificationId = Array.isArray(rawId) ? rawId[0] : rawId;

      const result = await notificationService.markAsRead(
        organizationId,
        recipientId,
        notificationId
      );

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        message: "Notification marked as read",
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/notifications/read-all
   * Mark all unread notifications belonging to the current user as read.
   */
  async markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.user!.organizationId;
      const recipientId = req.user!.userId;

      const result = await notificationService.markAllAsRead(
        organizationId,
        recipientId
      );

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        message: result.message,
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const notificationController = new NotificationController();
export default notificationController;

