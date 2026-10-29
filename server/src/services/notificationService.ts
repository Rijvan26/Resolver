import { Types } from "mongoose";
import { notificationDao, NotificationPaginationOptions } from "../dao/notificationDao";
import { INotification } from "../models/Notification";
import { NotificationType, Role, IncidentStatus, IncidentPriority } from "../types";
import { NotFoundError } from "../utils/errors";
import { ListNotificationsQueryInput } from "../validations/notificationValidation";

export interface NotificationActorSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface NotificationIncidentSummary {
  id: string;
  title: string;
  status: IncidentStatus;
  priority: IncidentPriority;
}

export interface SafeNotification {
  id: string;
  organizationId: string;
  recipientId: string;
  actor: NotificationActorSummary | null;
  incident: NotificationIncidentSummary | null;
  type: NotificationType;
  title: string;
  message: string;
  readAt: Date | null;
  isRead: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedNotificationsResult {
  notifications: SafeNotification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  unreadCount: number;
}

/**
 * Format an INotification document into a sanitized, typed API representation.
 */
export const formatNotification = (doc: INotification): SafeNotification => {
  const populatedActor = doc.actorId as unknown as {
    _id?: Types.ObjectId;
    name?: string;
    email?: string;
    role?: Role;
  } | null;

  const actorSummary: NotificationActorSummary | null = populatedActor?._id
    ? {
        id: populatedActor._id.toString(),
        name: populatedActor.name || "",
        email: populatedActor.email || "",
        role: populatedActor.role || ("DEVELOPER" as Role),
      }
    : null;

  const populatedIncident = doc.incidentId as unknown as {
    _id?: Types.ObjectId;
    title?: string;
    status?: IncidentStatus;
    priority?: IncidentPriority;
  } | null;

  const incidentSummary: NotificationIncidentSummary | null = populatedIncident?._id
    ? {
        id: populatedIncident._id.toString(),
        title: populatedIncident.title || "",
        status: populatedIncident.status || ("OPEN" as IncidentStatus),
        priority: populatedIncident.priority || ("MEDIUM" as IncidentPriority),
      }
    : null;

  return {
    id: doc._id.toString(),
    organizationId: doc.organizationId.toString(),
    recipientId: doc.recipientId.toString(),
    actor: actorSummary,
    incident: incidentSummary,
    type: doc.type,
    title: doc.title,
    message: doc.message,
    readAt: doc.readAt || null,
    isRead: !!doc.readAt,
    metadata: doc.metadata || {},
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

export class NotificationService {
  /**
   * List user notifications with pagination and unread filtering, strictly scoped to caller's org and recipient ID.
   */
  async listNotifications(
    organizationId: string,
    recipientId: string,
    query: ListNotificationsQueryInput
  ): Promise<PaginatedNotificationsResult> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const options: NotificationPaginationOptions = {
      unreadOnly: query.unread,
      skip,
      limit,
    };

    const [docs, total, unreadCount] = await Promise.all([
      notificationDao.findUserNotifications(organizationId, recipientId, options),
      notificationDao.countUserNotifications(organizationId, recipientId, { unreadOnly: query.unread }),
      notificationDao.countUnread(organizationId, recipientId),
    ]);

    const notifications = docs.map(formatNotification);

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      unreadCount,
    };
  }

  /**
   * Return unread notifications count for recipient in organization.
   */
  async getUnreadCount(organizationId: string, recipientId: string): Promise<{ unreadCount: number }> {
    const unreadCount = await notificationDao.countUnread(organizationId, recipientId);
    return { unreadCount };
  }

  /**
   * Mark a single notification as read for recipient in organization.
   */
  async markAsRead(
    organizationId: string,
    recipientId: string,
    notificationId: string
  ): Promise<SafeNotification> {
    const updated = await notificationDao.markAsRead(organizationId, recipientId, notificationId);
    if (!updated) {
      throw new NotFoundError("Notification not found");
    }

    return formatNotification(updated);
  }

  /**
   * Mark all unread notifications as read for recipient in organization.
   */
  async markAllAsRead(
    organizationId: string,
    recipientId: string
  ): Promise<{ message: string; modifiedCount: number }> {
    const { modifiedCount } = await notificationDao.markAllAsRead(organizationId, recipientId);
    return {
      message: `${modifiedCount} notification(s) marked as read`,
      modifiedCount,
    };
  }
}

export const notificationService = new NotificationService();
export default notificationService;

