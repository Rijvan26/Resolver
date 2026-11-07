import { Types } from "mongoose";
import { incidentDao, FindIncidentsFilter, IncidentPaginationOptions } from "../dao/incidentDao";
import { userDao } from "../dao/userDao";
import { activityDao } from "../dao/activityDao";
import { notificationEventService } from "./notificationEventService";
import { addAiJob } from "./ai/queue/bullmq";
import {
  IncidentPriority,
  IncidentStatus,
  INCIDENT_STATUS,
  Role,
  ROLES,
  ACTIVITY_ACTION,
  INCIDENT_PRIORITY_CREATION_PERMISSIONS,
  INCIDENT_STATUS_CREATION_PERMISSIONS,
  INCIDENT_PRIORITY_UPDATE_ROLES,
  INCIDENT_CLOSE_ROLES,
  INCIDENT_ASSIGNMENT_PERMISSIONS,
  ServiceTier,
  IncidentAiSubdocument,
  AI_STATUS,
} from "../types";
import { NotFoundError, ValidationError, ForbiddenError } from "../utils/errors";
import {
  CreateIncidentInput,
  UpdateIncidentInput,
  ListIncidentsQueryInput,
} from "../validations/incidentValidation";
import { IIncident } from "../models/Incident";

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive?: boolean;
}

export interface ServiceSummary {
  id: string;
  name: string;
  tier: ServiceTier;
  owningTeam: string;
  runbookLinks?: string[];
}

export interface SafeIncidentDetails {
  id: string;
  title: string;
  description: string;
  status: IncidentStatus;
  priority: IncidentPriority;
  organizationId: string;
  createdBy: UserSummary | string;
  assignee?: UserSummary | null;
  assigneeId?: string | null;
  service?: ServiceSummary | null;
  serviceId?: string | null;
  finalSeverity?: IncidentPriority | null;
  aiAccepted?: boolean;
  ai?: IncidentAiSubdocument;
  resolvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedIncidentsResult {
  incidents: SafeIncidentDetails[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Format a Mongoose incident document into a safe API response format.
 */
const formatIncident = (doc: IIncident): SafeIncidentDetails => {
  const populatedCreator = doc.createdBy as unknown as {
    _id?: Types.ObjectId;
    name?: string;
    email?: string;
    role?: Role;
  };

  const populatedAssignee = doc.assigneeId as unknown as {
    _id?: Types.ObjectId;
    name?: string;
    email?: string;
    role?: Role;
    isActive?: boolean;
  } | null;

  const creatorFormatted: UserSummary = populatedCreator?._id
    ? {
        id: populatedCreator._id.toString(),
        name: populatedCreator.name || "",
        email: populatedCreator.email || "",
        role: populatedCreator.role || ("DEVELOPER" as Role),
      }
    : {
        id: doc.createdBy.toString(),
        name: "",
        email: "",
        role: "DEVELOPER" as Role,
      };

  const assigneeFormatted: UserSummary | null = populatedAssignee?._id
    ? {
        id: populatedAssignee._id.toString(),
        name: populatedAssignee.name || "",
        email: populatedAssignee.email || "",
        role: populatedAssignee.role || ("DEVELOPER" as Role),
        isActive: populatedAssignee.isActive,
      }
    : null;

  const populatedService = doc.serviceId as unknown as {
    _id?: Types.ObjectId;
    name?: string;
    tier?: ServiceTier;
    owningTeam?: string;
    runbookLinks?: string[];
  } | null;

  const serviceFormatted: ServiceSummary | null = populatedService?._id
    ? {
        id: populatedService._id.toString(),
        name: populatedService.name || "",
        tier: populatedService.tier ?? 2,
        owningTeam: populatedService.owningTeam || "",
        runbookLinks: populatedService.runbookLinks || [],
      }
    : null;

  return {
    id: doc._id.toString(),
    title: doc.title,
    description: doc.description,
    status: doc.status,
    priority: doc.priority,
    organizationId: doc.organizationId.toString(),
    createdBy: creatorFormatted,
    assignee: assigneeFormatted,
    assigneeId: doc.assigneeId ? doc.assigneeId.toString() : null,
    service: serviceFormatted,
    serviceId: doc.serviceId ? doc.serviceId.toString() : null,
    finalSeverity: doc.finalSeverity || null,
    aiAccepted: doc.aiAccepted ?? false,
    ai: doc.ai || { status: AI_STATUS.NONE },
    resolvedAt: doc.resolvedAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

export class IncidentService {
  /**
   * Create a new incident.
   * Derives organizationId and createdBy strictly from authenticated server context.
   */
  async createIncident(
    organizationId: string,
    creatorUserId: string,
    creatorRole: Role,
    input: CreateIncidentInput
  ): Promise<SafeIncidentDetails> {
    // 1. Verify priority creation permission for caller's role
    if (input.priority) {
      const allowedPriorities = INCIDENT_PRIORITY_CREATION_PERMISSIONS[creatorRole] || [];
      if (!allowedPriorities.includes(input.priority)) {
        throw new ForbiddenError(
          `Your role (${creatorRole}) does not have permission to declare incidents with ${input.priority} severity`
        );
      }
    }

    // 2. Verify status creation permission for caller's role
    if (input.status) {
      const allowedStatuses = INCIDENT_STATUS_CREATION_PERMISSIONS[creatorRole] || [];
      if (!allowedStatuses.includes(input.status)) {
        throw new ForbiddenError(
          `Your role (${creatorRole}) does not have permission to create incidents in ${input.status} status`
        );
      }
    }

    // 3. If an assignee is designated, verify they belong to caller's org, are active, and verify assignment permission
    if (input.assigneeId) {
      const assignee = await userDao.findByOrgAndId(organizationId, input.assigneeId);
      if (!assignee) {
        throw new ValidationError(
          "Assignee does not exist within your organization"
        );
      }
      if (!assignee.isActive) {
        throw new ValidationError(
          "Cannot assign incident to a deactivated user"
        );
      }

      const allowedTargetRoles = INCIDENT_ASSIGNMENT_PERMISSIONS[creatorRole] || [];
      if (!allowedTargetRoles.includes(assignee.role)) {
        throw new ForbiddenError(
          `Your role (${creatorRole}) does not have permission to assign incidents to a member with role (${assignee.role})`
        );
      }
    }

    const created = await incidentDao.create({
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      organizationId,
      createdBy: creatorUserId,
      assigneeId: input.assigneeId || null,
      serviceId: input.serviceId || null,
      resolvedAt: input.status === INCIDENT_STATUS.RESOLVED ? new Date() : null,
    });

    // Record persistent audit entry for incident creation
    await activityDao.create({
      organizationId,
      incidentId: created._id,
      actorId: creatorUserId,
      action: ACTIVITY_ACTION.INCIDENT_CREATED,
      metadata: {
        title: created.title,
        status: created.status,
        priority: created.priority,
        assigneeId: created.assigneeId ? created.assigneeId.toString() : null,
      },
    });

    // Notify initial assignee if assigned upon creation
    if (created.assigneeId) {
      try {
        await notificationEventService.handleIncidentAssigned({
          organizationId,
          incidentId: created._id.toString(),
          incidentTitle: created.title,
          actorId: creatorUserId,
          newAssigneeId: created.assigneeId.toString(),
          oldAssigneeId: null,
        });
      } catch (notifErr) {
        console.error("⚠️ [IncidentService] Failed to dispatch incident assignment notification:", notifErr);
      }
    }

    // Enqueue background AI triage job (fail-open: never blocks or crashes incident creation)
    try {
      await addAiJob({
        jobType: "triage",
        incidentId: created._id.toString(),
        organizationId,
        userId: creatorUserId,
        serviceId: created.serviceId ? created.serviceId.toString() : null,
      });
    } catch (aiQueueErr) {
      console.warn("⚠️ [IncidentService] AI triage dispatch failed (failing open):", aiQueueErr);
    }

    // Retrieve populated document
    const incident = await incidentDao.findByOrgAndId(organizationId, created._id);
    return formatIncident(incident || created);
  }

  /**
   * List incidents with pagination, filtering, search, and sorting scoped to the organization.
   */
  async listIncidents(
    organizationId: string,
    query: ListIncidentsQueryInput
  ): Promise<PaginatedIncidentsResult> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const filter: FindIncidentsFilter = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.search ? { search: query.search } : {}),
    };

    const options: IncidentPaginationOptions = {
      skip,
      limit,
      sortBy: query.sortBy || "createdAt",
      sortOrder: query.sortOrder || "desc",
    };

    const [docs, total] = await Promise.all([
      incidentDao.findIncidentsByOrg(organizationId, filter, options),
      incidentDao.countIncidentsByOrg(organizationId, filter),
    ]);

    const incidents = docs.map(formatIncident);

    return {
      incidents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieve a single incident scoped to caller's organization.
   */
  async getIncident(
    organizationId: string,
    incidentId: string
  ): Promise<SafeIncidentDetails> {
    const incident = await incidentDao.findByOrgAndId(organizationId, incidentId);
    if (!incident) {
      throw new NotFoundError("Incident not found in organization");
    }

    return formatIncident(incident);
  }

  /**
   * Update incident details and status.
   * Rejects modification of immutable/protected fields.
   */
  async updateIncident(
    organizationId: string,
    incidentId: string,
    input: UpdateIncidentInput,
    userId?: string,
    actorRole?: Role
  ): Promise<SafeIncidentDetails> {
    // 1. Ensure incident exists in caller's organization
    const existing = await incidentDao.findByOrgAndId(organizationId, incidentId);
    if (!existing) {
      throw new NotFoundError("Incident not found in organization");
    }

    const existingCreatorId = (existing.createdBy as unknown as { _id?: Types.ObjectId })._id
      ? (existing.createdBy as unknown as { _id: Types.ObjectId })._id.toString()
      : existing.createdBy.toString();

    const existingAssigneeId = existing.assigneeId
      ? (existing.assigneeId as unknown as { _id?: Types.ObjectId })._id
        ? (existing.assigneeId as unknown as { _id: Types.ObjectId })._id.toString()
        : existing.assigneeId.toString()
      : null;

    const actorId = userId || existingCreatorId;

    // RBAC: Verify actor permissions on field updates
    if (actorRole) {
      // 1. Priority (Severity) update check: only SUPER_ADMIN, ADMIN, MANAGER
      if (input.priority !== undefined && input.priority !== existing.priority) {
        if (!INCIDENT_PRIORITY_UPDATE_ROLES.includes(actorRole)) {
          throw new ForbiddenError(
            `Your role (${actorRole}) is not authorized to modify incident severity. Only incident managers and administrators can change priority.`
          );
        }
      }

      // 2. Status update check
      if (input.status !== undefined && input.status !== existing.status) {
        if (input.status === INCIDENT_STATUS.CLOSED && !INCIDENT_CLOSE_ROLES.includes(actorRole)) {
          throw new ForbiddenError(
            `Your role (${actorRole}) is not authorized to close incidents. Only incident managers and administrators can close incidents.`
          );
        }

        if (actorRole === ROLES.DEVELOPER) {
          const isAssignee = existingAssigneeId === actorId;
          const isCreator = existingCreatorId === actorId;
          if (!isAssignee && !isCreator) {
            throw new ForbiddenError(
              "You are not authorized to update the status of an incident you are not assigned to or did not create"
            );
          }
        }
      }

      // 3. Title / Description update check
      const titleChanged = input.title !== undefined && input.title !== existing.title;
      const descChanged = input.description !== undefined && input.description !== existing.description;
      if (titleChanged || descChanged) {
        if (actorRole === ROLES.DEVELOPER) {
          const isAssignee = existingAssigneeId === actorId;
          const isCreator = existingCreatorId === actorId;
          if (!isAssignee && !isCreator) {
            throw new ForbiddenError(
              "You are not authorized to modify details of an incident you are not assigned to or did not create"
            );
          }
        }
      }
    }

    const updateData: Record<string, unknown> = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.status !== undefined) {
      updateData.status = input.status;
      if (input.status === INCIDENT_STATUS.RESOLVED && existing.status !== INCIDENT_STATUS.RESOLVED) {
        updateData.resolvedAt = new Date();
      } else if (input.status !== INCIDENT_STATUS.RESOLVED && existing.status === INCIDENT_STATUS.RESOLVED) {
        updateData.resolvedAt = null;
      }
    }
    if (input.priority !== undefined) updateData.priority = input.priority;
    if (input.serviceId !== undefined) updateData.serviceId = input.serviceId;

    const updated = await incidentDao.updateByOrgAndId(
      organizationId,
      incidentId,
      updateData
    );

    if (!updated) {
      throw new NotFoundError("Incident not found in organization");
    }

    // Audit status change
    if (input.status !== undefined && input.status !== existing.status) {
      await activityDao.create({
        organizationId,
        incidentId,
        actorId,
        action: ACTIVITY_ACTION.STATUS_CHANGED,
        metadata: {
          before: { status: existing.status },
          after: { status: input.status },
        },
      });

      // Dispatch status changed notification
      try {
        const currentAssigneeId = existing.assigneeId
          ? (existing.assigneeId as unknown as { _id?: Types.ObjectId })._id
            ? (existing.assigneeId as unknown as { _id: Types.ObjectId })._id.toString()
            : existing.assigneeId.toString()
          : null;

        await notificationEventService.handleIncidentStatusChanged({
          organizationId,
          incidentId,
          incidentTitle: updated.title,
          actorId,
          newStatus: input.status,
          oldStatus: existing.status,
          assigneeId: currentAssigneeId,
          createdBy: existingCreatorId,
        });
      } catch (notifErr) {
        console.error("⚠️ [IncidentService] Failed to dispatch status changed notification:", notifErr);
      }
    }

    // Audit priority change
    if (input.priority !== undefined && input.priority !== existing.priority) {
      await activityDao.create({
        organizationId,
        incidentId,
        actorId,
        action: ACTIVITY_ACTION.PRIORITY_CHANGED,
        metadata: {
          before: { priority: existing.priority },
          after: { priority: input.priority },
        },
      });

      // Dispatch priority changed notification
      try {
        const currentAssigneeId = existing.assigneeId
          ? (existing.assigneeId as unknown as { _id?: Types.ObjectId })._id
            ? (existing.assigneeId as unknown as { _id: Types.ObjectId })._id.toString()
            : existing.assigneeId.toString()
          : null;

        await notificationEventService.handleIncidentPriorityChanged({
          organizationId,
          incidentId,
          incidentTitle: updated.title,
          actorId,
          newPriority: input.priority,
          oldPriority: existing.priority,
          assigneeId: currentAssigneeId,
          createdBy: existingCreatorId,
        });
      } catch (notifErr) {
        console.error("⚠️ [IncidentService] Failed to dispatch priority changed notification:", notifErr);
      }
    }

    // Audit details update (title or description)
    const titleChanged = input.title !== undefined && input.title !== existing.title;
    const descChanged = input.description !== undefined && input.description !== existing.description;
    if (titleChanged || descChanged) {
      await activityDao.create({
        organizationId,
        incidentId,
        actorId,
        action: ACTIVITY_ACTION.DETAILS_UPDATED,
        metadata: {
          before: {
            ...(titleChanged ? { title: existing.title } : {}),
            ...(descChanged ? { description: existing.description } : {}),
          },
          after: {
            ...(titleChanged ? { title: input.title } : {}),
            ...(descChanged ? { description: input.description } : {}),
          },
        },
      });
    }

    return formatIncident(updated);
  }

  /**
   * Assign or reassign an incident.
   * Validates that target assignee is active and belongs to the same organization.
   */
  async updateAssignee(
    organizationId: string,
    incidentId: string,
    assigneeId: string | null,
    userId?: string,
    actorRole?: Role
  ): Promise<SafeIncidentDetails> {
    // 1. Ensure incident exists in caller's organization
    const existing = await incidentDao.findByOrgAndId(organizationId, incidentId);
    if (!existing) {
      throw new NotFoundError("Incident not found in organization");
    }

    const oldAssigneeId = existing.assigneeId
      ? (existing.assigneeId as unknown as { _id?: Types.ObjectId })._id
        ? (existing.assigneeId as unknown as { _id: Types.ObjectId })._id.toString()
        : existing.assigneeId.toString()
      : null;

    const existingCreatorId = (existing.createdBy as unknown as { _id?: Types.ObjectId })._id
      ? (existing.createdBy as unknown as { _id: Types.ObjectId })._id.toString()
      : existing.createdBy.toString();

    // 2. If actorRole is DEVELOPER, apply protection on existing assignment
    if (actorRole === ROLES.DEVELOPER) {
      if (oldAssigneeId) {
        const currentAssigneeUser = await userDao.findByOrgAndId(organizationId, oldAssigneeId);
        if (currentAssigneeUser && currentAssigneeUser.role !== ROLES.DEVELOPER) {
          throw new ForbiddenError(
            `Developers cannot reassign an incident assigned to a higher-privileged member (${currentAssigneeUser.role})`
          );
        }
        if (oldAssigneeId !== userId && existingCreatorId !== userId) {
          throw new ForbiddenError(
            "You are not authorized to reassign an incident assigned to another engineer"
          );
        }
      }
    }

    // 3. If assigning to a user, verify assignee belongs to org and is active, and verify actor's assignment permission
    if (assigneeId !== null) {
      const assignee = await userDao.findByOrgAndId(organizationId, assigneeId);
      if (!assignee) {
        throw new ValidationError(
          "Assignee does not exist within your organization"
        );
      }
      if (!assignee.isActive) {
        throw new ValidationError(
          "Cannot assign incident to a deactivated user"
        );
      }

      if (actorRole) {
        const allowedTargetRoles = INCIDENT_ASSIGNMENT_PERMISSIONS[actorRole] || [];
        if (!allowedTargetRoles.includes(assignee.role)) {
          throw new ForbiddenError(
            `Your role (${actorRole}) does not have permission to assign incidents to a member with role (${assignee.role})`
          );
        }
      }
    }

    const updated = await incidentDao.updateByOrgAndId(
      organizationId,
      incidentId,
      { assigneeId }
    );

    if (!updated) {
      throw new NotFoundError("Incident not found in organization");
    }

    const newAssigneeId = assigneeId ? assigneeId.toString() : null;

    if (oldAssigneeId !== newAssigneeId) {
      const actorId = userId || existing.createdBy.toString();
      await activityDao.create({
        organizationId,
        incidentId,
        actorId,
        action: ACTIVITY_ACTION.ASSIGNEE_CHANGED,
        metadata: {
          before: { assigneeId: oldAssigneeId },
          after: { assigneeId: newAssigneeId },
        },
      });

      // Dispatch incident assignment notification to new assignee
      if (newAssigneeId) {
        try {
          await notificationEventService.handleIncidentAssigned({
            organizationId,
            incidentId,
            incidentTitle: updated.title,
            actorId,
            newAssigneeId,
            oldAssigneeId,
          });
        } catch (notifErr) {
          console.error("⚠️ [IncidentService] Failed to dispatch assignee changed notification:", notifErr);
        }
      }
    }

    return formatIncident(updated);
  }

  /**
   * Delete an incident.
   */
  async deleteIncident(
    organizationId: string,
    incidentId: string,
    userId?: string
  ): Promise<void> {
    const existing = await incidentDao.findByOrgAndId(organizationId, incidentId);
    if (!existing) {
      throw new NotFoundError("Incident not found in organization");
    }

    // Record persistent audit entry prior to incident deletion
    await activityDao.create({
      organizationId,
      incidentId,
      actorId: userId || existing.createdBy.toString(),
      action: ACTIVITY_ACTION.INCIDENT_DELETED,
      metadata: {
        title: existing.title,
        status: existing.status,
      },
    });

    await incidentDao.deleteByOrgAndId(organizationId, incidentId);
  }
}

export const incidentService = new IncidentService();
export default incidentService;
