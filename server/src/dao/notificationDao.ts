import { ClientSession, Types } from "mongoose";
import { Notification, INotification } from "../models/Notification";
import { NotificationType } from "../types";

export interface CreateNotificationDaoInput {
  organizationId: Types.ObjectId | string;
  recipientId: Types.ObjectId | string;
  actorId?: Types.ObjectId | string | null;
  incidentId?: Types.ObjectId | string | null;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationPaginationOptions {
  unreadOnly?: boolean;
  skip?: number;
  limit?: number;
}

export class NotificationDao {
  /**
   * Create a new in-app notification.
   */
  async create(data: CreateNotificationDaoInput, session?: ClientSession): Promise<INotification> {
    const notification = new Notification({
      organizationId: data.organizationId,
      recipientId: data.recipientId,
      actorId: data.actorId || null,
      incidentId: data.incidentId || null,
      type: data.type,
      title: data.title,
      message: data.message,
      metadata: data.metadata || {},
    });

    return await notification.save({ session });
  }

  /**
   * Bulk insert notifications (e.g. for multi-recipient broadcasts).
   */
  async createMany(
    items: CreateNotificationDaoInput[],
    session?: ClientSession
  ): Promise<INotification[]> {
    if (items.length === 0) return [];
    const docs = items.map((data) => ({
      organizationId: data.organizationId,
      recipientId: data.recipientId,
      actorId: data.actorId || null,
      incidentId: data.incidentId || null,
      type: data.type,
      title: data.title,
      message: data.message,
      metadata: data.metadata || {},
    }));
    return (await Notification.insertMany(docs, { session })) as unknown as INotification[];
  }

  /**
   * Find a single notification strictly scoped to caller's organization and recipient ID.
   */
  async findByIdAndRecipient(
    organizationId: string | Types.ObjectId,
    recipientId: string | Types.ObjectId,
    notificationId: string | Types.ObjectId
  ): Promise<INotification | null> {
    return await Notification.findOne({
      _id: notificationId,
      organizationId,
      recipientId,
    })
      .populate("actorId", "name email role")
      .populate("incidentId", "title status priority")
      .exec();
  }

  /**
   * List paginated notifications for a recipient within their organization,
   * sorted in reverse chronological order (newest first).
   */
  async findUserNotifications(
    organizationId: string | Types.ObjectId,
    recipientId: string | Types.ObjectId,
    options: NotificationPaginationOptions = {}
  ): Promise<INotification[]> {
    const filter: Record<string, unknown> = {
      organizationId,
      recipientId,
    };

    if (options.unreadOnly) {
      filter.readAt = null;
    }

    let query = Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .populate("actorId", "name email role")
      .populate("incidentId", "title status priority");

    if (options.skip !== undefined) {
      query = query.skip(options.skip);
    }
    if (options.limit !== undefined) {
      query = query.limit(options.limit);
    }

    return await query.exec();
  }

  /**
   * Count user notifications matching filter.
   */
  async countUserNotifications(
    organizationId: string | Types.ObjectId,
    recipientId: string | Types.ObjectId,
    options: { unreadOnly?: boolean } = {}
  ): Promise<number> {
    const filter: Record<string, unknown> = {
      organizationId,
      recipientId,
    };

    if (options.unreadOnly) {
      filter.readAt = null;
    }

    return await Notification.countDocuments(filter).exec();
  }

  /**
   * Count unread notifications for a recipient in their organization.
   */
  async countUnread(
    organizationId: string | Types.ObjectId,
    recipientId: string | Types.ObjectId
  ): Promise<number> {
    return await Notification.countDocuments({
      organizationId,
      recipientId,
      readAt: null,
    }).exec();
  }

  /**
   * Mark a single notification as read for a user in their organization.
   */
  async markAsRead(
    organizationId: string | Types.ObjectId,
    recipientId: string | Types.ObjectId,
    notificationId: string | Types.ObjectId,
    readAt: Date = new Date()
  ): Promise<INotification | null> {
    return await Notification.findOneAndUpdate(
      {
        _id: notificationId,
        organizationId,
        recipientId,
      },
      {
        $set: { readAt },
      },
      {
        returnDocument: "after",
      }
    )
      .populate("actorId", "name email role")
      .populate("incidentId", "title status priority")
      .exec();
  }

  /**
   * Mark all unread notifications as read for a recipient in their organization.
   * Returns the count of documents modified.
   */
  async markAllAsRead(
    organizationId: string | Types.ObjectId,
    recipientId: string | Types.ObjectId,
    readAt: Date = new Date()
  ): Promise<{ modifiedCount: number }> {
    const result = await Notification.updateMany(
      {
        organizationId,
        recipientId,
        readAt: null,
      },
      {
        $set: { readAt },
      }
    ).exec();

    return { modifiedCount: result.modifiedCount };
  }

  /**
   * Check for an existing duplicate notification within an idempotency time window.
   */
  async findRecentDuplicate(
    organizationId: string | Types.ObjectId,
    recipientId: string | Types.ObjectId,
    incidentId: string | Types.ObjectId | null,
    type: NotificationType,
    timeWindowMs: number = 60000
  ): Promise<INotification | null> {
    const since = new Date(Date.now() - timeWindowMs);
    const filter: Record<string, unknown> = {
      organizationId,
      recipientId,
      type,
      createdAt: { $gte: since },
    };
    if (incidentId) {
      filter.incidentId = incidentId;
    }
    return await Notification.findOne(filter).exec();
  }
}

export const notificationDao = new NotificationDao();
export default notificationDao;
