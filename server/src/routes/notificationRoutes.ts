import { Router } from "express";
import { notificationController } from "../controllers/notificationController";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from "../validations/notificationValidation";

const router = Router();

// All notification endpoints require authenticated user context
router.use(authenticate);

/**
 * GET /api/v1/notifications
 * List notifications for current user with pagination and optional unread filter.
 */
router.get(
  "/",
  validate(listNotificationsQuerySchema, "query"),
  notificationController.listNotifications
);

/**
 * GET /api/v1/notifications/unread-count
 * Return total unread notifications count for current user.
 */
router.get(
  "/unread-count",
  notificationController.getUnreadCount
);

/**
 * PATCH /api/v1/notifications/read-all
 * Mark all unread notifications for current user in organization as read.
 * (Defined before :notificationId/read to prevent route shadowing)
 */
router.patch(
  "/read-all",
  notificationController.markAllAsRead
);

/**
 * PATCH /api/v1/notifications/:notificationId/read
 * Mark a single notification as read.
 */
router.patch(
  "/:notificationId/read",
  validate(notificationIdParamSchema, "params"),
  notificationController.markAsRead
);

export default router;

