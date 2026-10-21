import { Types } from "mongoose";
import { incidentDao, FindIncidentsFilter, IncidentPaginationOptions } from "../dao/incidentDao";
import { userDao } from "../dao/userDao";
import { activityDao } from "../dao/activityDao";
import { IncidentPriority, IncidentStatus, Role, ACTIVITY_ACTION } from "../types";
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
    input: CreateIncidentInput
  ): Promise<SafeIncidentDetails> {
    // If an assignee is designated, verify they belong to caller's org and are active
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
    }

    const created = await incidentDao.create({
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      organizationId,
      createdBy: creatorUserId,
      assigneeId: input.assigneeId || null,
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
    userId?: string
  ): Promise<SafeIncidentDetails> {
    // 1. Ensure incident exists in caller's organization
    const existing = await incidentDao.findByOrgAndId(organizationId, incidentId);
    if (!existing) {
      throw new NotFoundError("Incident not found in organization");
    }

    const updateData: Record<string, unknown> = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.priority !== undefined) updateData.priority = input.priority;

    const updated = await incidentDao.updateByOrgAndId(
      organizationId,
      incidentId,
      updateData
    );

    if (!updated) {
      throw new NotFoundError("Incident not found in organization");
    }

    const actorId = userId || existing.createdBy.toString();

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
    userId?: string
  ): Promise<SafeIncidentDetails> {
    // 1. Ensure incident exists in caller's organization
    const existing = await incidentDao.findByOrgAndId(organizationId, incidentId);
    if (!existing) {
      throw new NotFoundError("Incident not found in organization");
    }

    // 2. If assigning to a user, verify assignee belongs to org and is active
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
    }

    const updated = await incidentDao.updateByOrgAndId(
      organizationId,
      incidentId,
      { assigneeId }
    );

    if (!updated) {
      throw new NotFoundError("Incident not found in organization");
    }

    const oldAssigneeId = existing.assigneeId
      ? (existing.assigneeId as unknown as { _id?: Types.ObjectId })._id
        ? (existing.assigneeId as unknown as { _id: Types.ObjectId })._id.toString()
        : existing.assigneeId.toString()
      : null;
    const newAssigneeId = assigneeId ? assigneeId.toString() : null;

    if (oldAssigneeId !== newAssigneeId) {
      await activityDao.create({
        organizationId,
        incidentId,
        actorId: userId || existing.createdBy.toString(),
        action: ACTIVITY_ACTION.ASSIGNEE_CHANGED,
        metadata: {
          before: { assigneeId: oldAssigneeId },
          after: { assigneeId: newAssigneeId },
        },
      });
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
