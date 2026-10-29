import { Types } from "mongoose";
import { notificationDao } from "../dao/notificationDao";
import { userDao } from "../dao/userDao";
import { emailDeliveryService } from "./emailDeliveryService";
import { NOTIFICATION_TYPES, IncidentStatus, IncidentPriority } from "../types";

export interface IncidentAssignedEventParams {
  organizationId: string;
  incidentId: string;
  incidentTitle: string;
  actorId: string;
  newAssigneeId: string | null;
  oldAssigneeId?: string | null;
}

export interface IncidentStatusChangedEventParams {
  organizationId: string;
  incidentId: string;
  incidentTitle: string;
  actorId: string;
  newStatus: IncidentStatus;
  oldStatus: IncidentStatus;
  assigneeId?: string | null;
  createdBy: string;
}

export interface IncidentPriorityChangedEventParams {
  organizationId: string;
  incidentId: string;
  incidentTitle: string;
  actorId: string;
  newPriority: IncidentPriority;
  oldPriority: IncidentPriority;
  assigneeId?: string | null;
  createdBy: string;
}

export interface CommentAddedEventParams {
  organizationId: string;
  incidentId: string;
  incidentTitle: string;
  actorId: string;
  commentId: string;
  commentContent: string;
  assigneeId?: string | null;
  createdBy: string;
}

export class NotificationEventService {
  /**
   * Helper: verify user exists, belongs to organization, and is active.
   */
  private async getActiveOrgMember(
    organizationId: string,
    userId: string
  ): Promise<{ id: string; name: string; email: string } | null> {
    try {
      const user = await userDao.findByOrgAndId(organizationId, userId);
      if (!user || !user.isActive) {
        return null;
      }
      return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
      };
    } catch {
      return null;
    }
  }

  /**
   * Safe asynchronous job executor: catches errors and guarantees that
   * background notification failures never crash the host process or affect caller.
   */
  private safeExecute(fn: () => Promise<void>, eventName: string): void {
    Promise.resolve(fn()).catch((err) => {
      console.error(
        `❌ [NotificationEventService] Background processing error during ${eventName}:`,
        err instanceof Error ? err.message : err
      );
    });
  }

  /**
   * Handle incident assignment or reassignment.
   * Rules:
   * - No-op if newAssigneeId is null or equal to oldAssigneeId.
   * - No self-notification if newAssigneeId === actorId.
   * - Only notify if recipient is an active member of the organization.
   * - Dispatches email notification for incident assignment.
   */
  async handleIncidentAssigned(params: IncidentAssignedEventParams): Promise<void> {
    const { organizationId, incidentId, incidentTitle, actorId, newAssigneeId, oldAssigneeId } = params;

    // 1. Guard: no change in assignee
    if (!newAssigneeId || newAssigneeId === oldAssigneeId) {
      return;
    }

    // 2. Guard: avoid notifying user about their own action
    if (newAssigneeId === actorId) {
      return;
    }

    // 3. Verify recipient is active member of incident's organization
    const recipient = await this.getActiveOrgMember(organizationId, newAssigneeId);
    if (!recipient) {
      return;
    }

    // 4. Idempotency: verify no duplicate assignment notification within 30 seconds
    const duplicate = await notificationDao.findRecentDuplicate(
      organizationId,
      recipient.id,
      incidentId,
      NOTIFICATION_TYPES.INCIDENT_ASSIGNED,
      30000
    );
    if (duplicate) {
      return;
    }

    const title = "Incident Assigned";
    const message = `You have been assigned to incident "${incidentTitle}"`;

    // 5. Persist in-app notification
    await notificationDao.create({
      organizationId,
      recipientId: recipient.id,
      actorId,
      incidentId,
      type: NOTIFICATION_TYPES.INCIDENT_ASSIGNED,
      title,
      message,
      metadata: {
        incidentId,
        oldAssigneeId: oldAssigneeId || null,
        newAssigneeId,
      },
    });

    // 6. Asynchronously trigger email delivery
    this.safeExecute(async () => {
      await emailDeliveryService.sendEmail({
        to: recipient.email,
        recipientName: recipient.name,
        subject: `[Resolver] Assigned: ${incidentTitle}`,
        text: `Hello ${recipient.name},\n\nYou have been assigned to incident "${incidentTitle}".\n\nPlease review and take action in Resolver.`,
        metadata: { incidentId, type: NOTIFICATION_TYPES.INCIDENT_ASSIGNED },
      });
    }, "sendEmailForIncidentAssigned");
  }

  /**
   * Handle incident status changes.
   * Notifies incident assignee and creator (excluding actor, active members only).
   */
  async handleIncidentStatusChanged(params: IncidentStatusChangedEventParams): Promise<void> {
    const { organizationId, incidentId, incidentTitle, actorId, newStatus, oldStatus, assigneeId, createdBy } = params;

    // Guard: status didn't actually change
    if (newStatus === oldStatus) {
      return;
    }

    // Candidate recipients: assignee and creator, excluding the actor who made the change
    const candidateIds = Array.from(new Set([assigneeId, createdBy].filter(Boolean))) as string[];
    const recipientIds = candidateIds.filter((id) => id !== actorId);

    if (recipientIds.length === 0) {
      return;
    }

    const title = "Incident Status Updated";
    const message = `Incident "${incidentTitle}" status changed from ${oldStatus} to ${newStatus}`;

    for (const id of recipientIds) {
      const recipient = await this.getActiveOrgMember(organizationId, id);
      if (!recipient) continue;

      const duplicate = await notificationDao.findRecentDuplicate(
        organizationId,
        recipient.id,
        incidentId,
        NOTIFICATION_TYPES.INCIDENT_STATUS_CHANGED,
        15000
      );
      if (duplicate) continue;

      await notificationDao.create({
        organizationId,
        recipientId: recipient.id,
        actorId,
        incidentId,
        type: NOTIFICATION_TYPES.INCIDENT_STATUS_CHANGED,
        title,
        message,
        metadata: {
          incidentId,
          oldStatus,
          newStatus,
        },
      });
    }
  }

  /**
   * Handle incident priority changes.
   * Notifies incident assignee and creator (excluding actor, active members only).
   */
  async handleIncidentPriorityChanged(params: IncidentPriorityChangedEventParams): Promise<void> {
    const { organizationId, incidentId, incidentTitle, actorId, newPriority, oldPriority, assigneeId, createdBy } = params;

    // Guard: priority didn't actually change
    if (newPriority === oldPriority) {
      return;
    }

    // Candidate recipients: assignee and creator, excluding the actor
    const candidateIds = Array.from(new Set([assigneeId, createdBy].filter(Boolean))) as string[];
    const recipientIds = candidateIds.filter((id) => id !== actorId);

    if (recipientIds.length === 0) {
      return;
    }

    const title = "Incident Priority Updated";
    const message = `Incident "${incidentTitle}" priority changed from ${oldPriority} to ${newPriority}`;

    for (const id of recipientIds) {
      const recipient = await this.getActiveOrgMember(organizationId, id);
      if (!recipient) continue;

      const duplicate = await notificationDao.findRecentDuplicate(
        organizationId,
        recipient.id,
        incidentId,
        NOTIFICATION_TYPES.INCIDENT_PRIORITY_CHANGED,
        15000
      );
      if (duplicate) continue;

      await notificationDao.create({
        organizationId,
        recipientId: recipient.id,
        actorId,
        incidentId,
        type: NOTIFICATION_TYPES.INCIDENT_PRIORITY_CHANGED,
        title,
        message,
        metadata: {
          incidentId,
          oldPriority,
          newPriority,
        },
      });
    }
  }

  /**
   * Handle new comment added on an incident.
   * Notifies incident assignee and creator (excluding actor, active members only).
   */
  async handleCommentAdded(params: CommentAddedEventParams): Promise<void> {
    const { organizationId, incidentId, incidentTitle, actorId, commentId, commentContent, assigneeId, createdBy } = params;

    // Candidate recipients: assignee and creator, excluding commenter
    const candidateIds = Array.from(new Set([assigneeId, createdBy].filter(Boolean))) as string[];
    const recipientIds = candidateIds.filter((id) => id !== actorId);

    if (recipientIds.length === 0) {
      return;
    }

    const truncatedContent = commentContent.length > 80 ? `${commentContent.slice(0, 77)}...` : commentContent;
    const title = "New Comment on Incident";
    const message = `New comment on "${incidentTitle}": "${truncatedContent}"`;

    for (const id of recipientIds) {
      const recipient = await this.getActiveOrgMember(organizationId, id);
      if (!recipient) continue;

      const duplicate = await notificationDao.findRecentDuplicate(
        organizationId,
        recipient.id,
        incidentId,
        NOTIFICATION_TYPES.INCIDENT_COMMENT_ADDED,
        10000
      );
      if (duplicate) continue;

      await notificationDao.create({
        organizationId,
        recipientId: recipient.id,
        actorId,
        incidentId,
        type: NOTIFICATION_TYPES.INCIDENT_COMMENT_ADDED,
        title,
        message,
        metadata: {
          incidentId,
          commentId,
        },
      });
    }
  }
}

export const notificationEventService = new NotificationEventService();
export default notificationEventService;

